<?php
/*
 * Verwaltung (ab 0.22.0): Superadmin (Plattform) und Vereinsadmin (Verein)
 * Superadmin: legt Vereine an, setzt Vereinsadmins ein, sperrt Vereine. Sieht keine Mannschaftsdaten (Kader, IEP, Noten …),
 *             nur Aufbau und Zugänge der Erwachsenen.
 * Vereinsadmin: legt Mannschaften an, lädt Trainer ein, bestimmt Cheftrainer, öffnet jede Mannschaft seines Vereins.
 *
 * GET → {ok, platform, clubs:[{id, name, active, own, admins:[{accountId, name, username, pending}],
 *                              teams:[{id, name, season, active, players, coaches:[{id, accountId, name, username, head, pending}]}]}]}
 * POST {action, …}
 *   club_create {name, adminName, adminUsername}       Superadmin: neuer Verein + Vereinsadmin (Einmal-Code)
 *   club_update {club, name?, active?}                 Name: Vereinsadmin · aktiv/gesperrt: Superadmin
 *   admin_add {club, name, username} / admin_remove {club, accountId}
 *   team_create {club, name, season} / team_update {team, name?, season?, active?}
 *   coach_add {team, name, username, head} / coach_head {team, coachId, head} / coach_remove {team, coachId}
 *   code {club, accountId}                             neuer Einmal-Code für einen Vereinsadmin oder Trainer des Vereins
 * Antworten mit neuem Konto oder Code: {code, username, expires}
 */
require __DIR__ . '/config.php';
require_login();
$acc = current_account();
if ($acc['kind'] !== 'coach') json_out(['ok' => false, 'error' => 'Nur für Vereins- und Superadmins.'], 403);
$super = !empty($acc['platform_admin']);
$clubs = array_column(admin_clubs($acc), null, 'id');
if (!$super && !$clubs) json_out(['ok' => false, 'error' => 'Nur für Vereins- und Superadmins.'], 403);

$q = function (string $sql, array $args = []): PDOStatement { $st = pdb()->prepare($sql); $st->execute($args); return $st; };
$fail = fn(string $msg, int $code = 400) => json_out(['ok' => false, 'error' => $msg], $code);
$expires = fn() => date('d.m.Y H:i', time() + CODE_HOURS * 3600);

$clubOut = function (array $c) use ($q): array {
    $admins = $q("SELECT a.id, a.username, a.must_set_pw, co.name FROM club_admins x JOIN accounts a ON a.id = x.account_id
                  LEFT JOIN coaches co ON co.id = a.ref WHERE x.club_id = ? ORDER BY co.name", [$c['id']])->fetchAll(PDO::FETCH_ASSOC);
    $teams = $q('SELECT * FROM teams WHERE club_id = ? ORDER BY active DESC, name, season', [$c['id']])->fetchAll(PDO::FETCH_ASSOC);
    return ['id' => $c['id'], 'name' => $c['name'], 'active' => $c['active'], 'own' => $c['own'],
        'admins' => array_map(fn($a) => ['accountId' => (int)$a['id'], 'name' => (string)$a['name'], 'username' => $a['username'], 'pending' => (bool)$a['must_set_pw']], $admins),
        'teams' => array_map(function ($t) use ($q) {
            $co = $q("SELECT c.id, c.name, a.id AS acc, a.username, a.must_set_pw, m.is_admin FROM memberships m JOIN coaches c ON c.id = m.ref
                      JOIN accounts a ON a.id = m.account_id WHERE m.team_id = ? AND m.role = 'coach' ORDER BY m.is_admin DESC, c.name", [$t['id']])->fetchAll(PDO::FETCH_ASSOC);
            return ['id' => (int)$t['id'], 'name' => $t['name'], 'season' => $t['season'], 'active' => (bool)$t['active'],
                'players' => (int)$q("SELECT COUNT(*) FROM memberships WHERE team_id = ? AND role = 'player'", [$t['id']])->fetchColumn(),
                'coaches' => array_map(fn($c) => ['id' => (int)$c['id'], 'accountId' => (int)$c['acc'], 'name' => $c['name'], 'username' => $c['username'],
                                                  'head' => (bool)$c['is_admin'], 'pending' => (bool)$c['must_set_pw']], $co)];
        }, $teams)];
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'platform' => $super, 'clubs' => array_map($clubOut, array_values($clubs))]);

$in = json_in();
$action = (string)($in['action'] ?? '');

/* Rechte: Verein muss verwaltbar sein (Vereinsadmin dieses Vereins oder Superadmin) */
$club = function (int $id) use ($clubs, $fail): array { return $clubs[$id] ?? $fail('Diesen Verein verwaltest du nicht.', 403); };
$team = function (int $id) use ($q, $club, $fail): array {
    $t = $q('SELECT * FROM teams WHERE id = ?', [$id])->fetch(PDO::FETCH_ASSOC) ?: $fail('Diese Mannschaft gibt es nicht.', 404);
    $club((int)$t['club_id']);
    return $t;
};
/* Trainer-Konto anlegen oder vorhandenes finden → [accountId, coachId, code|null] */
$coachAccount = function (string $name, string $username) use ($q, $fail): array {
    $u = clean_username($username);
    if ($u !== '') {
        $a = $q('SELECT * FROM accounts WHERE username = ?', [$u])->fetch(PDO::FETCH_ASSOC);
        if ($a) {
            if ($a['kind'] !== 'coach') $fail('Dieser Benutzername gehört zu einem Spieler-Konto.', 409);
            return [(int)$a['id'], (int)$a['ref'], null, $u];
        }
    }
    $name = clean_text($name, 30);
    if ($name === '') $fail('Bitte einen Vornamen eingeben.');
    if ($u === '') $u = unique_username(pdb(), username_ok(clean_username($name)) ? clean_username($name) : 'trainer');
    if (!username_ok($u)) $fail('Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.');
    $cid = create_coach($name);
    pdb()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw) VALUES (?, 'coach', ?, 1)")->execute([$u, $cid]);
    $aid = (int)pdb()->lastInsertId();
    return [$aid, $cid, issue_code($aid), $u];
};
/* Konto löschen, wenn es nirgends mehr dabei ist (keine Mannschaft, kein Verein, kein Superadmin) */
$orphan = function (int $aid) use ($q): void {
    $a = $q('SELECT * FROM accounts WHERE id = ?', [$aid])->fetch(PDO::FETCH_ASSOC);
    if (!$a || !empty($a['platform_admin'])) return;
    if ((int)$q('SELECT (SELECT COUNT(*) FROM memberships WHERE account_id = ?) + (SELECT COUNT(*) FROM club_admins WHERE account_id = ?)', [$aid, $aid])->fetchColumn()) return;
    $q('DELETE FROM accounts WHERE id = ?', [$aid]);
    if (!(int)$q("SELECT COUNT(*) FROM accounts WHERE kind = 'coach' AND ref = ?", [$a['ref']])->fetchColumn()) $q('DELETE FROM coaches WHERE id = ?', [$a['ref']]);
};
/* Erfolg melden und ins Sicherheitsprotokoll schreiben (welche Verwaltungsaktion, für wen) */
$labels = ['club_create' => 'Verein angelegt', 'club_update' => 'Verein geändert', 'admin_add' => 'Vereinsadmin hinzugefügt', 'admin_remove' => 'Vereinsadmin entfernt',
           'team_create' => 'Mannschaft angelegt', 'team_update' => 'Mannschaft geändert', 'coach_add' => 'Trainer hinzugefügt', 'coach_head' => 'Cheftrainer geändert',
           'coach_remove' => 'Trainer entfernt', 'code' => 'neuer Einmal-Code'];
$done = function (array $extra = []) use ($in, $labels) {
    $act = (string)($in['action'] ?? '');
    $parts = [];
    foreach (['name', 'club', 'team', 'coachId', 'accountId'] as $k) if (isset($in[$k]) && $in[$k] !== '') $parts[] = "$k=" . (is_scalar($in[$k]) ? $in[$k] : '');
    if (array_key_exists('active', $in)) $parts[] = !empty($in['active']) ? 'aktiv' : 'gesperrt/archiviert';
    if (array_key_exists('head', $in)) $parts[] = !empty($in['head']) ? 'Cheftrainer' : 'kein Cheftrainer';
    $acc = isset($in['accountId']) ? (int)$in['accountId'] : null;
    $level = in_array($act, ['code', 'admin_add', 'admin_remove', 'club_create', 'coach_remove'], true) || array_key_exists('active', $in) ? 'warn' : 'info';
    sec_log('admin_' . $act, $level, $acc, (string)($extra['username'] ?? sec_user($acc)), trim(($labels[$act] ?? $act) . ' · ' . implode(', ', $parts), ' ·'));
    json_out(['ok' => true, 'me' => coach_state()] + $extra);
};
$codeOut = fn(?string $code, string $u) => $code ? ['code' => $code, 'username' => $u, 'expires' => $expires()] : ['username' => $u];

switch ($action) {
    case 'club_create':
        if (!$super) $fail('Nur der Superadmin legt Vereine an.', 403);
        $name = clean_text($in['name'] ?? '', 60);
        if ($name === '') $fail('Bitte den Vereinsnamen eingeben.');
        if ($q('SELECT COUNT(*) FROM clubs WHERE name = ?', [$name])->fetchColumn()) $fail('Diesen Verein gibt es schon.', 409);
        pdb()->beginTransaction();
        $q('INSERT INTO clubs (name) VALUES (?)', [$name]);
        $cid = (int)pdb()->lastInsertId();
        [$aid, , $code, $u] = $coachAccount((string)($in['adminName'] ?? ''), (string)($in['adminUsername'] ?? ''));
        $q('INSERT OR IGNORE INTO club_admins (account_id, club_id) VALUES (?, ?)', [$aid, $cid]);
        pdb()->commit();
        $done(['club' => $cid] + $codeOut($code, $u));

    case 'club_update':
        $c = $club((int)($in['club'] ?? 0));
        if (array_key_exists('name', $in)) {
            $name = clean_text($in['name'], 60);
            if ($name === '') $fail('Der Name darf nicht leer sein.');
            $q('UPDATE clubs SET name = ? WHERE id = ?', [$name, $c['id']]);
        }
        if (array_key_exists('active', $in)) {
            if (!$super) $fail('Nur der Superadmin sperrt Vereine.', 403);
            $q('UPDATE clubs SET active = ? WHERE id = ?', [!empty($in['active']) ? 1 : 0, $c['id']]);
        }
        $done();

    case 'admin_add':
        $c = $club((int)($in['club'] ?? 0));
        [$aid, , $code, $u] = $coachAccount((string)($in['name'] ?? ''), (string)($in['username'] ?? ''));
        if (is_club_admin($aid, $c['id'])) $fail('Ist schon Vereinsadmin.', 409);
        $q('INSERT INTO club_admins (account_id, club_id) VALUES (?, ?)', [$aid, $c['id']]);
        $done($codeOut($code, $u));

    case 'admin_remove':
        $c = $club((int)($in['club'] ?? 0));
        $aid = (int)($in['accountId'] ?? 0);
        if ($aid === (int)$acc['id']) $fail('Dich selbst kann nur ein anderer Vereinsadmin entfernen.');
        if ((int)$q('SELECT COUNT(*) FROM club_admins WHERE club_id = ?', [$c['id']])->fetchColumn() <= 1) $fail('Ein Verein braucht mindestens einen Vereinsadmin.');
        $q('DELETE FROM club_admins WHERE account_id = ? AND club_id = ?', [$aid, $c['id']]);
        $orphan($aid);
        $done();

    case 'team_create':
        $c = $club((int)($in['club'] ?? 0));
        if (!$c['active']) $fail('Dieser Verein ist gesperrt.');
        $name = clean_text($in['name'] ?? '', 40);
        $season = clean_text($in['season'] ?? '', 20);
        if ($name === '') $fail('Bitte einen Namen eingeben, z. B. U15.');
        if ($q('SELECT COUNT(*) FROM teams WHERE club_id = ? AND name = ? AND season = ? AND active = 1', [$c['id'], $name, $season])->fetchColumn())
            $fail('Diese Mannschaft gibt es im Verein schon.', 409);
        $tid = create_team($c['id'], $name, $season);
        db($tid);                                                             // Datei anlegen
        $done(['team' => $tid]);

    case 'team_update':
        $t = $team((int)($in['team'] ?? 0));
        if (array_key_exists('name', $in)) {
            $name = clean_text($in['name'], 40);
            if ($name === '') $fail('Der Name darf nicht leer sein.');
            $q('UPDATE teams SET name = ? WHERE id = ?', [$name, $t['id']]);
        }
        if (array_key_exists('season', $in)) $q('UPDATE teams SET season = ? WHERE id = ?', [clean_text($in['season'], 20), $t['id']]);
        if (array_key_exists('active', $in)) $q('UPDATE teams SET active = ? WHERE id = ?', [!empty($in['active']) ? 1 : 0, $t['id']]);   // Archiv: Daten bleiben erhalten
        $done();

    case 'coach_add':
        $t = $team((int)($in['team'] ?? 0));
        [$aid, $cid, $code, $u] = $coachAccount((string)($in['name'] ?? ''), (string)($in['username'] ?? ''));
        if ($q('SELECT COUNT(*) FROM memberships WHERE account_id = ? AND team_id = ?', [$aid, $t['id']])->fetchColumn()) $fail('Ist schon in dieser Mannschaft.', 409);
        $q("INSERT INTO memberships (account_id, team_id, role, ref, is_admin) VALUES (?, ?, 'coach', ?, ?)", [$aid, $t['id'], $cid, !empty($in['head']) ? 1 : 0]);
        $done($codeOut($code, $u));

    case 'coach_head':
        $t = $team((int)($in['team'] ?? 0));
        $q("UPDATE memberships SET is_admin = ? WHERE team_id = ? AND role = 'coach' AND ref = ?", [!empty($in['head']) ? 1 : 0, $t['id'], (int)($in['coachId'] ?? 0)]);
        $done();

    case 'coach_remove':
        $t = $team((int)($in['team'] ?? 0));
        $a = account_for('coach', (int)($in['coachId'] ?? 0), (int)$t['id']) ?: $fail('Dieser Trainer ist nicht in der Mannschaft.', 404);
        $q('DELETE FROM memberships WHERE account_id = ? AND team_id = ?', [$a['id'], $t['id']]);
        $orphan((int)$a['id']);
        $done();

    case 'code':
        $c = $club((int)($in['club'] ?? 0));
        $aid = (int)($in['accountId'] ?? 0);
        if ($aid === (int)$acc['id']) $fail('Für dich selbst: „Passwort ändern“ benutzen.');
        $a = $q("SELECT * FROM accounts WHERE id = ? AND kind = 'coach'", [$aid])->fetch(PDO::FETCH_ASSOC) ?: $fail('Dieses Konto gibt es nicht.', 404);
        $inClub = is_club_admin($aid, $c['id']) || $q("SELECT COUNT(*) FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.account_id = ? AND t.club_id = ?", [$aid, $c['id']])->fetchColumn();
        if (!$inClub) $fail('Dieses Konto gehört nicht zu deinem Verein.', 403);
        // Ist das Konto auch in einem anderen Verein, setzt nur der Superadmin den Zugang zurück
        $other = $q("SELECT (SELECT COUNT(*) FROM club_admins WHERE account_id = ? AND club_id != ?) +
                            (SELECT COUNT(*) FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.account_id = ? AND t.club_id != ?)", [$aid, $c['id'], $aid, $c['id']])->fetchColumn();
        if ($other && !$super) $fail('Dieses Konto gehört auch zu einem anderen Verein. Einen neuen Code gibt der Superadmin.', 403);
        if (!empty($a['platform_admin']) && !$super) $fail('Den Zugang des Superadmins kannst du nicht zurücksetzen.', 403);
        $done($codeOut(issue_code($aid), $a['username']));
}
$fail('Unbekannte Aktion');
