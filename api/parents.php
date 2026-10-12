<?php
/*
 * Elternzugänge eines Kindes verwalten (ab 0.37.0, alle Trainer der Mannschaft)
 * GET ?nr=7                               → {ok, parents:[{id, username, pending, email, kids}], max}
 * POST {action:"add", nr, username?}      → neues Elternkonto mit Einmal-Code (72 Std.) – oder vorhandenes Elternkonto
 *                                            (Geschwister) mit diesem Kind verknüpfen → {ok, username, code?, existing?}
 * POST {action:"code", nr, id}            → neuer Einmal-Code (altes Passwort ungültig, alle Geräte abgemeldet)
 * POST {action:"remove", nr, id}          → Verknüpfung lösen; Konto ohne weiteres Kind wird gelöscht
 * Höchstens PARENTS_MAX Elternkonten pro Kind.
 */
require __DIR__ . '/config.php';
$me = require_coach();
$team = (int)team_id();

$list = function (int $nr) use ($team): array {
    $st = pdb()->prepare("SELECT a.id, a.username, a.pw_hash, a.must_set_pw, a.email, (SELECT COUNT(*) FROM parent_links x WHERE x.account_id = a.id) AS kids
                          FROM parent_links l JOIN accounts a ON a.id = l.account_id AND a.kind = 'parent' WHERE l.team_id = ? AND l.nr = ? ORDER BY l.created_at");
    $st->execute([$team, $nr]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'username' => $r['username'], 'pending' => $r['pw_hash'] === '' || (int)$r['must_set_pw'] === 1,
                                'email' => $r['email'] !== '', 'kids' => (int)$r['kids']], $st->fetchAll(PDO::FETCH_ASSOC));
};
$player = function (int $nr): void {
    $st = db()->prepare('SELECT 1 FROM players WHERE nr = ? AND active = 1'); $st->execute([$nr]);
    if (!$st->fetchColumn()) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $nr = (int)($_GET['nr'] ?? 0); $player($nr);
    json_out(['ok' => true, 'parents' => $list($nr), 'max' => PARENTS_MAX]);
}

require_method('POST');
$in = json_in();
$nr = (int)($in['nr'] ?? 0); $player($nr);
$acc = current_account();
$linked = function (int $id) use ($team, $nr): array {
    $st = pdb()->prepare("SELECT a.* FROM parent_links l JOIN accounts a ON a.id = l.account_id AND a.kind = 'parent' WHERE l.account_id = ? AND l.team_id = ? AND l.nr = ?");
    $st->execute([$id, $team, $nr]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: json_out(['ok' => false, 'error' => 'Dieser Elternzugang gehört nicht zu diesem Kind.'], 404);
};

switch ($in['action'] ?? '') {
    case 'add':
        if (count($list($nr)) >= PARENTS_MAX) json_out(['ok' => false, 'error' => 'Pro Kind gibt es höchstens ' . PARENTS_MAX . ' Elternzugänge.'], 400);
        $u = clean_username((string)($in['username'] ?? ''));
        if ($u !== '') {
            $st = pdb()->prepare('SELECT * FROM accounts WHERE username = ?'); $st->execute([$u]);
            if ($ex = $st->fetch(PDO::FETCH_ASSOC)) {          // vorhandenes Elternkonto (Geschwisterkind) verknüpfen
                if ($ex['kind'] !== 'parent') json_out(['ok' => false, 'error' => 'Dieser Benutzername gehört nicht zu einem Elternkonto.'], 409);
                pdb()->prepare('INSERT OR IGNORE INTO parent_links (account_id, team_id, nr) VALUES (?, ?, ?)')->execute([$ex['id'], $team, $nr]);
                sec_log('parent_link', 'info', (int)$ex['id'], $ex['username'], "mit Nr. $nr verknüpft (von {$acc['username']})");
                json_out(['ok' => true, 'username' => $ex['username'], 'existing' => true, 'parents' => $list($nr)]);
            }
            if (!username_ok($u)) json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
        } else {
            $kid = account_for('player', $nr)['username'] ?? "nr$nr";
            $u = unique_username(pdb(), substr(preg_replace('/[^a-z0-9._-]/', '', $kid), 0, 22) . '.eltern');
        }
        pdb()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw, last_team) VALUES (?, 'parent', 0, 1, ?)")->execute([$u, $team]);
        $id = (int)pdb()->lastInsertId();
        pdb()->prepare('INSERT INTO parent_links (account_id, team_id, nr) VALUES (?, ?, ?)')->execute([$id, $team, $nr]);
        $code = issue_code($id);
        sec_log('parent_add', 'info', $id, $u, "Elternzugang für Nr. $nr angelegt (von {$acc['username']})");
        json_out(['ok' => true, 'username' => $u, 'code' => $code, 'expires' => date('d.m.Y H:i', time() + CODE_HOURS * 3600), 'parents' => $list($nr)]);
    case 'code':
        $a = $linked((int)($in['id'] ?? 0));
        $code = issue_code((int)$a['id']);
        sec_log('code_issued', 'warn', (int)$a['id'], $a['username'], "Elternzugang (Nr. $nr): neuer Einmal-Code, bisheriges Passwort ungültig");
        json_out(['ok' => true, 'username' => $a['username'], 'code' => $code, 'expires' => date('d.m.Y H:i', time() + CODE_HOURS * 3600), 'parents' => $list($nr)]);
    case 'remove':
        $a = $linked((int)($in['id'] ?? 0));
        parent_unlink((int)$a['id'], $team, $nr);
        sec_log('parent_remove', 'warn', (int)$a['id'], $a['username'], "Elternzugang von Nr. $nr entfernt (von {$acc['username']})");
        json_out(['ok' => true, 'parents' => $list($nr)]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
