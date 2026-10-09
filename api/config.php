<?php
/*
 * Lernzone API – gemeinsame Einstellungen und Hilfsfunktionen (Weg B)
 * Voraussetzung: PHP 8.1+, PDO mit SQLite (oder MySQL, siehe DSN unten).
 */
declare(strict_types=1);

// Datenbanken (SQLite) im Ordner /storage – nicht öffentlich erreichbar machen!
//   platform.sqlite  Vereine, Mannschaften, Zugänge, Trainer, Mitgliedschaften (tools/platform.sql)
//   <db_file>        je Mannschaft eine eigene Datei mit allen Mannschaftsdaten (tools/schema.sql)
//   Die erste Mannschaft nutzt die bisherige Datei lernzone.sqlite weiter.
const STORAGE_DIR   = __DIR__ . '/../storage';
const PLATFORM_FILE = STORAGE_DIR . '/platform.sqlite';
const LEGACY_FILE   = 'lernzone.sqlite';

const MAX_LOGIN_TRIES = 5;      // Fehlversuche pro Konto (und pro Sitzung) …
const LOCK_SECONDS    = 300;    // … danach 5 Minuten Sperre
const COACH_IDLE      = 8 * 3600;   // Trainer nach 8 Stunden ohne Aktivität abmelden
const CODE_HOURS      = 72;         // Einmal-Codes sind 72 Stunden gültig
const PW_MIN_PLAYER   = 12;         // Mindestlänge Passwort Spieler
const PW_MIN_COACH    = 14;         // Mindestlänge Passwort Trainer/Admin
const PENDING_SECONDS = 900;        // 15 Minuten Zeit, um nach dem Einmal-Code das eigene Passwort festzulegen

date_default_timezone_set('Europe/Berlin');

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,   // 30 Tage angemeldet bleiben
    'path'     => '/',
    'secure'   => !empty($_SERVER['HTTPS']),
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_name('lernzone');
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

/* ---------- Datenbanken ---------- */

/* Plattform: Vereine, Mannschaften, Zugänge, Trainer, Mitgliedschaften */
function pdb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . PLATFORM_FILE, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('PRAGMA foreign_keys = OFF');
        $pdo->exec(file_get_contents(__DIR__ . '/../tools/platform.sql'));
        platform_bootstrap($pdo);
    }
    return $pdo;
}

/* Gewählte Mannschaft dieser Sitzung (null = noch keine, z. B. vor der Anmeldung) */
function team_id(): ?int { return !empty($_SESSION['team']) ? (int)$_SESSION['team'] : null; }

function team_row(int $id): ?array {
    $st = pdb()->prepare('SELECT t.*, c.name AS club_name FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = ? AND t.active = 1 AND c.active = 1');
    $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

/*
 * Datenbank der gewählten Mannschaft. Die Plattform-Datenbank ist als „p“ angehängt: Abfragen auf
 * accounts, coaches und memberships landen dort automatisch (die Mannschafts-Datei hat diese Tabellen nicht).
 * Ohne gewählte Mannschaft gibt db() die Plattform-Datenbank zurück (Anmeldung, Zugänge).
 */
function db(?int $team = null): PDO {
    static $cache = [];
    $team ??= team_id();
    if (!$team) return pdb();
    if (isset($cache[$team])) return $cache[$team];
    $t = team_row($team);
    if (!$t) { unset($_SESSION['team']); json_out(['ok' => false, 'error' => 'Diese Mannschaft gibt es nicht mehr. Bitte neu anmelden.'], 401); }
    pdb();   // Plattform zuerst anlegen bzw. übernehmen
    $pdo = new PDO('sqlite:' . STORAGE_DIR . '/' . basename($t['db_file']), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec(file_get_contents(__DIR__ . '/../tools/schema.sql'));   // legt fehlende Tabellen an
    migrate($pdo);
    if ((int)$t['id'] === 1) seed_demo_players($pdo);   // Demo-Kader (nur Entwicklung) nur in der ersten Mannschaft
    $pdo->exec('ATTACH DATABASE ' . $pdo->quote(PLATFORM_FILE) . ' AS p');
    return $cache[$team] = $pdo;
}

/*
 * Einmalig: bisherige Einzel-Installation (storage/lernzone.sqlite mit Zugängen und Trainern) wird zum ersten Verein.
 * Vereins- und Mannschaftsname kommen aus data/team.json („SV Heimstetten U14“ → Verein „SV Heimstetten“, Mannschaft „U14“).
 */
function platform_bootstrap(PDO $p): void {
    if ((int)$p->query('SELECT COUNT(*) FROM teams')->fetchColumn() > 0) return;
    $legacy = STORAGE_DIR . '/' . LEGACY_FILE;
    if (!is_file($legacy)) return;                                       // Neuinstallation: erstes Konto über die Einrichtung
    $old = new PDO('sqlite:' . $legacy, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $has = fn(string $t) => (bool)$old->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = " . $old->quote($t))->fetchColumn();
    $team = json_decode((string)@file_get_contents(__DIR__ . '/../data/team.json'), true) ?: [];
    $full = trim((string)($team['name'] ?? 'Mein Verein'));
    [$club, $tname] = preg_match('/^(.*\S)\s+(U\d+.*)$/u', $full, $m) ? [$m[1], $m[2]] : [$full, 'Mannschaft'];
    $p->beginTransaction();
    $p->prepare('INSERT INTO clubs (id, name) VALUES (1, ?)')->execute([$club]);
    $p->prepare('INSERT INTO teams (id, club_id, name, db_file) VALUES (1, 1, ?, ?)')->execute([$tname, LEGACY_FILE]);
    if ($has('coaches')) {
        $ins = $p->prepare('INSERT INTO coaches (id, name, pin_hash, is_admin, active, fail_count, locked_until) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($old->query('SELECT * FROM coaches')->fetchAll(PDO::FETCH_ASSOC) as $c)
            $ins->execute([$c['id'], $c['name'], $c['pin_hash'], $c['is_admin'], $c['active'], $c['fail_count'], $c['locked_until']]);
    }
    if ($has('accounts')) {
        $cols = 'id, username, kind, ref, pw_hash, code_hash, code_expires, must_set_pw, active, sess_ver, fail_count, locked_until, last_login, created_at';
        $ins = $p->prepare("INSERT INTO accounts ($cols, last_team) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $mem = $p->prepare('INSERT INTO memberships (account_id, team_id, role, ref, is_admin, created_at) VALUES (?, 1, ?, ?, ?, ?)');
        $adm = $p->prepare('SELECT is_admin FROM coaches WHERE id = ?');
        foreach ($old->query("SELECT $cols FROM accounts")->fetchAll(PDO::FETCH_NUM) as $a) {
            $ins->execute($a);
            $isAdmin = 0;
            if ($a[2] === 'coach') { $adm->execute([$a[3]]); $isAdmin = (int)$adm->fetchColumn(); }
            $mem->execute([$a[0], $a[2] === 'coach' ? 'coach' : 'player', $a[3], $isAdmin, $a[13]]);
        }
    }
    // Der erste Admin-Trainer betreibt die Plattform (darf später Vereine freischalten)
    $p->exec("UPDATE accounts SET platform_admin = 1 WHERE id = (SELECT MIN(account_id) FROM memberships WHERE role = 'coach' AND is_admin = 1)");
    $p->commit();
    // Alte Tabellen in der Mannschafts-Datei umbenennen (bleiben als Sicherung erhalten, werden nicht mehr benutzt)
    foreach (['accounts', 'coaches'] as $t) if ($has($t)) $old->exec("ALTER TABLE $t RENAME TO _legacy_$t");
    $old->exec('DROP INDEX IF EXISTS accounts_ref');
}

/* Ergänzt, was in älteren Datenbanken noch fehlt */
function migrate(PDO $pdo): void {
    $cols = array_column($pdo->query('PRAGMA table_info(players)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $add = ['pos_off' => "TEXT NOT NULL DEFAULT ''", 'pos_def' => "TEXT NOT NULL DEFAULT ''",
            'consent' => 'INTEGER NOT NULL DEFAULT 0', 'fail_count' => 'INTEGER NOT NULL DEFAULT 0',
            'locked_until' => 'INTEGER NOT NULL DEFAULT 0'];
    foreach ($add as $c => $def) {
        if (!in_array($c, $cols, true)) $pdo->exec("ALTER TABLE players ADD COLUMN $c $def");
    }
    // 0.9.0: Termine aus dem Kalender
    $tcols = array_column($pdo->query('PRAGMA table_info(trainings)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    foreach (['end_time' => "TEXT NOT NULL DEFAULT ''", 'title' => "TEXT NOT NULL DEFAULT ''", 'kind' => "TEXT NOT NULL DEFAULT 'training'",
              'location' => "TEXT NOT NULL DEFAULT ''", 'cal_key' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) {
        if (!in_array($c, $tcols, true)) $pdo->exec("ALTER TABLE trainings ADD COLUMN $c $def");
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS trainings_cal ON trainings (cal_key)');
    // 0.13.0: Anwesenheit „wer nicht absagt, ist da“ – bisher erfasste Trainings gelten als erledigt
    if (!in_array('att_done', $tcols, true)) {
        $pdo->exec("ALTER TABLE trainings ADD COLUMN att_done INTEGER NOT NULL DEFAULT 0");
        $pdo->exec('UPDATE trainings SET att_done = 1 WHERE id IN (SELECT DISTINCT training_id FROM attendance)');
    }
    // 0.17.0: IEP-Stände als Versionen – bisherige Einträge einmalig übernehmen
    if (!$pdo->query("SELECT 1 FROM settings WHERE name = 'iep_versions_done'")->fetchColumn()) {
        $pdo->exec('INSERT INTO iep_versions (nr, data, created_at, created_by) SELECT nr, data, updated_at, updated_by FROM iep ORDER BY nr');
        $pdo->exec("INSERT INTO settings (name, value) VALUES ('iep_versions_done', '1')");
    }
    // Automatisch „da“ erst für Trainings ab dem Tag dieser Umstellung (ältere ohne Eintrag zählen nicht)
    $pdo->exec("INSERT OR IGNORE INTO settings (name, value) VALUES ('auto_att_from', '" . date('Y-m-d') . "')");
}

/*
 * Nur für die Entwicklung (z. B. XAMPP): Ist die Datenbank leer und liegt data/demo-pins.json vor,
 * werden die Spieler aus data/players.json mit den Demo-PINs übernommen.
 * Auf dem echten Server demo-pins.json NICHT hochladen, dann passiert hier nichts.
 */
function seed_demo_players(PDO $pdo): void {
    $pinsFile = __DIR__ . '/../data/demo-pins.json';
    if (!is_file($pinsFile)) return;
    if ((int)$pdo->query('SELECT COUNT(*) FROM players')->fetchColumn() > 0) return;
    $players = json_decode((string)file_get_contents(__DIR__ . '/../data/players.json'), true) ?: [];
    $pins    = json_decode((string)file_get_contents($pinsFile), true) ?: [];
    $st = $pdo->prepare('INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($players as $p) {
        if (!isset($pins[(string)$p['nr']])) continue;
        $st->execute([$p['nr'], $p['pos'], $p['plan'], $p['posOff'] ?? '', $p['posDef'] ?? '',
                      password_hash((string)$pins[(string)$p['nr']], PASSWORD_DEFAULT)]);
    }
}

/* ---------- Ein- und Ausgabe ---------- */

function json_out(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_in(): array {
    $data = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($data) ? $data : [];
}

function require_method(string $m): void {
    if ($_SERVER['REQUEST_METHOD'] !== $m) json_out(['ok' => false, 'error' => 'Methode nicht erlaubt'], 405);
}

/* Text säubern: Steuerzeichen raus, Länge begrenzen */
function clean_text($v, int $max): string {
    $s = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)$v) ?? '');
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function int_in($v, int $min, int $max): ?int {
    $i = filter_var($v, FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]);
    return $i === false ? null : $i;
}

function today(): string { return date('Y-m-d'); }

/* Anfrage kommt vom selben Rechner (XAMPP / localhost) */
function is_local_request(): bool {
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

/* Erlaubte Positionskürzel aus data/team.json */
function valid_positions(): array {
    $team = json_decode((string)file_get_contents(__DIR__ . '/../data/team.json'), true) ?: [];
    return array_column($team['positions'] ?? [], 'id');
}

/* ---------- Spieler ---------- */

function player_out(array $r): array {
    return ['nr' => (int)$r['nr'], 'pos' => $r['pos'], 'plan' => $r['plan'],
            'posOff' => (string)($r['pos_off'] ?? ''), 'posDef' => (string)($r['pos_def'] ?? ''),
            'consent' => (bool)($r['consent'] ?? false)];
}

function current_user(): ?array {
    if (empty($_SESSION['nr']) || !team_id()) return null;
    $st = db()->prepare('SELECT nr, pos, plan, pos_off, pos_def, consent FROM players WHERE nr = ? AND active = 1');
    $st->execute([$_SESSION['nr']]);
    $u = $st->fetch(PDO::FETCH_ASSOC);
    return $u ? player_out($u) : null;
}

function require_user(): array {
    $u = current_user();
    if (!$u) json_out(['ok' => false, 'error' => 'Nicht angemeldet'], 401);
    return $u;
}

function require_consent(array $u): void {
    if (empty($u['consent'])) json_out(['ok' => false, 'error' => 'Dein Trainer schaltet das frei, sobald die Einwilligung deiner Eltern da ist.'], 403);
}

/* ---------- Trainer ---------- */

/* Trainer der gewählten Mannschaft; isAdmin = Admin dieser Mannschaft (Mitgliedschaft) */
function current_coach(): ?array {
    if (empty($_SESSION['coach']) || !team_id()) return null;
    $st = pdb()->prepare("SELECT c.id, c.name, m.is_admin FROM coaches c JOIN memberships m ON m.ref = c.id AND m.role = 'coach' AND m.team_id = ?
                          WHERE c.id = ? AND c.active = 1");
    $st->execute([team_id(), (int)$_SESSION['coach']]);
    $c = $st->fetch(PDO::FETCH_ASSOC);
    return $c ? ['id' => (int)$c['id'], 'name' => $c['name'], 'isAdmin' => (bool)$c['is_admin']] : null;
}

/* Mannschaften, zu denen ein Konto gehört (für die Auswahl oben) */
function account_teams(int $accountId): array {
    $st = pdb()->prepare('SELECT t.id, t.name, t.season, c.id AS club_id, c.name AS club, m.role, m.is_admin FROM memberships m
                          JOIN teams t ON t.id = m.team_id AND t.active = 1 JOIN clubs c ON c.id = t.club_id AND c.active = 1
                          WHERE m.account_id = ? ORDER BY c.name, t.name');
    $st->execute([$accountId]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'season' => $r['season'], 'clubId' => (int)$r['club_id'],
                                'club' => $r['club'], 'role' => $r['role'], 'isAdmin' => (bool)$r['is_admin']], $st->fetchAll(PDO::FETCH_ASSOC));
}

function team_info(): ?array {
    $t = team_id() ? team_row(team_id()) : null;
    return $t ? ['id' => (int)$t['id'], 'name' => $t['name'], 'season' => $t['season'], 'club' => $t['club_name'], 'clubId' => (int)$t['club_id']] : null;
}

function coach_state(): array {
    $c = current_coach();
    $has = (int)pdb()->query('SELECT COUNT(*) FROM teams')->fetchColumn() > 0;
    $acc = current_account();
    return [
        'active'     => $c !== null,
        'id'         => $c['id'] ?? null,
        'name'       => $c['name'] ?? null,
        'isAdmin'    => $c['isAdmin'] ?? false,
        'team'       => team_info(),
        'teams'      => $c && $acc ? array_values(array_filter(account_teams((int)$acc['id']), fn($t) => $t['role'] === 'coach')) : [],
        'platformAdmin' => (bool)($acc['platform_admin'] ?? false),
        'hasCoaches' => $has,
        'canSetup'   => !$has && is_local_request(),   // erster Verein + erstes Admin-Konto nur auf localhost
    ];
}

function require_coach(): array {
    $c = current_coach();
    if (!$c) json_out(['ok' => false, 'error' => 'Nur für Trainer.'], 403);
    return $c;
}

function require_admin(): array {
    $c = require_coach();
    if (!$c['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    return $c;
}

/* ---------- Schutz gegen PIN-Raten ---------- */

/* pro Sitzung (bremst einen Browser, der viele Konten durchprobiert) */
function check_lock(string $k): void {
    if (($_SESSION[$k . '_locked_until'] ?? 0) > time()) {
        json_out(['ok' => false, 'error' => 'Zu viele Versuche. Warte ein paar Minuten.'], 429);
    }
}
function count_fail(string $k): void {
    $_SESSION[$k . '_tries'] = ($_SESSION[$k . '_tries'] ?? 0) + 1;
    if ($_SESSION[$k . '_tries'] >= MAX_LOGIN_TRIES * 2) {
        $_SESSION[$k . '_locked_until'] = time() + LOCK_SECONDS;
        $_SESSION[$k . '_tries'] = 0;
    }
}

/* pro Konto in der Datenbank (gilt auch, wenn jemand Cookies löscht) */
function account_locked(string $table, string $key, int $id): bool {
    $st = pdb()->prepare("SELECT locked_until FROM $table WHERE $key = ?");
    $st->execute([$id]);
    return (int)$st->fetchColumn() > time();
}
function account_fail(string $table, string $key, int $id): void {
    pdb()->prepare("UPDATE $table SET fail_count = fail_count + 1 WHERE $key = ?")->execute([$id]);
    pdb()->prepare("UPDATE $table SET locked_until = ?, fail_count = 0 WHERE $key = ? AND fail_count >= ?")
        ->execute([time() + LOCK_SECONDS, $id, MAX_LOGIN_TRIES]);
}
function account_ok(string $table, string $key, int $id): void {
    pdb()->prepare("UPDATE $table SET fail_count = 0, locked_until = 0 WHERE $key = ?")->execute([$id]);
}

/* ---------- Trainings, Beteiligung, Befinden ---------- */

/* Trainingsbeteiligung: alle Trainings (nur Art „training“) seit der Aufnahme in den Kader bis heute; last = die letzten 20 (alt → neu) */
function attendance_summary(int $nr): array {
    // Gezählt wird ab Saisonbeginn (Einstellung) bzw. ab dem Tag, an dem das Konto angelegt wurde – das spätere Datum.
    // Nur Trainings mit erfasster Anwesenheit zählen (att_done = 1; automatisch nach Trainingsende, siehe att_autofill).
    $since = substr((string)(account_for('player', $nr)['created_at'] ?? '2000-01-01'), 0, 10);
    $season = (string)(db()->query("SELECT value FROM settings WHERE name = 'season_start'")->fetchColumn() ?: '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $season) && $season > $since) $since = $season;
    $st = db()->prepare('SELECT t.id, t.date, CASE WHEN a.nr IS NULL THEN 0 ELSE 1 END AS present
                         FROM trainings t LEFT JOIN attendance a ON a.training_id = t.id AND a.nr = ?
                         WHERE t.date <= ? AND t.date >= ? AND t.kind = \'training\'
                           AND t.att_done = 1
                         ORDER BY t.date DESC, t.time DESC');
    att_autofill();
    $st->execute([$nr, today(), $since]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $attended = count(array_filter($rows, fn($r) => (int)$r['present'] === 1));
    $last = array_reverse(array_slice($rows, 0, 20));
    return ['total' => count($rows), 'attended' => $attended,
            'last' => array_map(fn($r) => ['date' => $r['date'], 'present' => (bool)$r['present']], $last)];
}

/* ---------- Anwesenheit: wer nicht abgesagt hat, ist da ---------- */
/* Trainingsende als Zeitstempel (ohne Ende: Beginn + 90 Min., ohne Uhrzeit: Tagesende) */
function training_end(array $t): int {
    if (($t['end_time'] ?? '') !== '') return strtotime($t['date'] . ' ' . $t['end_time']);
    if ($t['time'] !== '') return strtotime($t['date'] . ' ' . $t['time']) + 5400;
    return strtotime($t['date'] . ' 23:59');
}
/* Wer laut Absagen kommt: alle aktiven Spieler ohne Absage */
function expected_players(int $id): array {
    $st = db()->prepare('SELECT nr FROM players WHERE active = 1 AND nr NOT IN (SELECT nr FROM absences WHERE training_id = ?) ORDER BY nr');
    $st->execute([$id]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}
/* Anwesenheit festschreiben: alle ohne Absage = da (Trainer korrigiert danach einzelne) */
function att_materialize(int $id): void {
    db()->prepare('DELETE FROM attendance WHERE training_id = ?')->execute([$id]);
    $ins = db()->prepare('INSERT INTO attendance (training_id, nr) VALUES (?, ?)');
    foreach (expected_players($id) as $nr) $ins->execute([$id, $nr]);
    db()->prepare('UPDATE trainings SET att_done = 1 WHERE id = ?')->execute([$id]);
}
function att_auto_from(): string {
    return (string)(db()->query("SELECT value FROM settings WHERE name = 'auto_att_from'")->fetchColumn() ?: today());
}
/* Gilt für dieses Training „wer nicht absagt, ist da“ (noch nicht erfasst, ab der Umstellung)? */
function att_expected(array $t): bool {
    return (int)$t['att_done'] === 0 && $t['kind'] === 'training' && $t['date'] >= att_auto_from();
}
/* Nach Trainingsende automatisch festschreiben (nur Trainings ab der Umstellung, siehe migrate) */
function att_autofill(): void {
    static $done = false; if ($done) return; $done = true;
    $from = att_auto_from();
    $st = db()->prepare("SELECT id, date, time, end_time FROM trainings WHERE kind = 'training' AND att_done = 0 AND date >= ? AND date <= ?");
    $st->execute([$from, today()]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) if (training_end($t) <= time()) att_materialize((int)$t['id']);
}

/* ---------- Absagen ---------- */
const ABSENCE_REASONS = ['schule' => 'Schule / Lernen', 'krank' => 'Krank', 'urlaub' => 'Urlaub / Familie', 'sonst' => 'Sonstiges'];
const ABSENCE_HOURS = 2;                                     // Absagen bis 2 Stunden vor Beginn

/* Bis wann darf abgesagt werden? Ohne Uhrzeit: bis zum Vortag 24 Uhr */
function absence_deadline(array $t): int {
    $start = strtotime($t['date'] . ' ' . ($t['time'] !== '' ? $t['time'] : '00:00'));
    return $t['time'] !== '' ? $start - ABSENCE_HOURS * 3600 : $start;
}

/* Die nächsten Trainings eines Spielers mit seinem Absage-Stand */
function upcoming_for(int $nr, int $days = 14, int $limit = 6): array {
    $st = db()->prepare("SELECT t.id, t.date, t.time, t.end_time, t.title, t.location, t.att_done, b.reason,
                                (SELECT COUNT(*) FROM attendance a WHERE a.training_id = t.id AND a.nr = ?) AS present
                         FROM trainings t LEFT JOIN absences b ON b.training_id = t.id AND b.nr = ?
                         WHERE t.kind = 'training' AND t.date >= ? AND t.date <= ? ORDER BY t.date, t.time LIMIT $limit");
    $st->execute([$nr, $nr, today(), date('Y-m-d', strtotime("+$days days"))]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $end = strtotime($t['date'] . ' ' . ($t['end_time'] ?: ($t['time'] ?: '23:59')));
        if ($end < time()) continue;                          // heute schon vorbei
        $dl = absence_deadline($t);
        $out[] = ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'endTime' => $t['end_time'],
                  'title' => $t['title'] !== '' ? $t['title'] : 'Training', 'location' => $t['location'],
                  'absent' => $t['reason'], 'cancelled' => (int)$t['att_done'] === 2,
                  'canChange' => time() < $dl && (int)$t['att_done'] !== 2, 'deadline' => date('Y-m-d H:i', $dl)];
    }
    return $out;
}

/* Letzte Befindens-Einträge eines Spielers, gruppiert pro Training (neu → alt) */
function recent_moods(int $nr, int $limit = 10): array {
    $st = db()->prepare('SELECT m.training_id, t.date, t.time, m.phase, m.data FROM moods m
                         JOIN trainings t ON t.id = m.training_id WHERE m.nr = ?
                         ORDER BY t.date DESC, t.time DESC');
    $st->execute([$nr]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $k = (int)$r['training_id'];
        $out[$k] ??= ['trainingId' => $k, 'date' => $r['date'], 'time' => $r['time'], 'vor' => null, 'nach' => null];
        $out[$k][$r['phase']] = json_decode($r['data'], true);
    }
    return array_slice(array_values($out), 0, $limit);
}

/* Hinweis für den Trainer: zweimal in Folge schlechte Laune oder zuletzt „nicht fit“ */
function mood_flag(int $nr): ?string {
    $vor = array_values(array_filter(array_map(fn($m) => $m['vor'], recent_moods($nr, 5))));
    if (!$vor) return null;
    if (!empty($vor[0]['nichtfit'])) return 'fühlt sich nicht fit';
    if (count($vor) >= 2 && ($vor[0]['laune'] ?? 5) <= 2 && ($vor[1]['laune'] ?? 5) <= 2) return 'zweimal schlechte Laune';
    return null;
}

function profile_of(int $nr): array {
    $st = db()->prepare('SELECT data FROM profiles WHERE nr = ?');
    $st->execute([$nr]);
    $d = $st->fetchColumn();
    return $d ? (json_decode((string)$d, true) ?: []) : [];
}

/* ---------- Zugänge (Benutzername + Passwort) ---------- */

function hash_pw(string $pw): string {
    return password_hash($pw, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

/* Benutzername: 3–30 Zeichen, Kleinbuchstaben, Ziffern, Punkt, Bindestrich, Unterstrich */
function clean_username(string $u): string {
    $u = mb_strtolower(trim($u));
    $u = strtr($u, ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'ß' => 'ss', ' ' => '.']);
    return preg_replace('/[^a-z0-9._-]/', '', $u) ?? '';
}
function username_ok(string $u): bool { return (bool)preg_match('/^[a-z0-9][a-z0-9._-]{2,29}$/', $u); }

function username_taken(string $u, int $exceptId = 0): bool {
    $st = pdb()->prepare('SELECT COUNT(*) FROM accounts WHERE username = ? AND id != ?');
    $st->execute([$u, $exceptId]);
    return (int)$st->fetchColumn() > 0;
}
function unique_username(PDO $pdo, string $base): string {
    $base = username_ok($base) ? $base : 'user';
    $u = $base; $i = 2;
    $sep = preg_match('/\d$/', $base) ? '-' : '';                      // spieler7 → spieler7-2 (nicht spieler72)
    $st = $pdo->prepare('SELECT COUNT(*) FROM accounts WHERE username = ?');
    while (true) { $st->execute([$u]); if ((int)$st->fetchColumn() === 0) return $u; $u = $base . $sep . $i++; }
}

/* Passwort-Regeln: mindestens 12 Zeichen (Trainer/Admin 14), Groß- und Kleinbuchstabe, Zahl, Sonderzeichen, nicht der Benutzername, keine Allerwelts-Passwörter */
function pw_min(string $kind): int { return $kind === 'coach' ? PW_MIN_COACH : PW_MIN_PLAYER; }
function pw_problem(string $pw, string $username, string $kind = 'player'): ?string {
    $min = pw_min($kind);
    if (mb_strlen($pw) < $min) return "Das Passwort muss mindestens $min Zeichen haben. Tipp: drei Wörter mit Bindestrich und eine Zahl, z. B. Ball-Tor-Wolke-7.";
    if (mb_strlen($pw) > 200) return 'Das Passwort ist zu lang.';
    $miss = [];
    if (!preg_match('/\p{Lu}/u', $pw)) $miss[] = 'ein Großbuchstabe';
    if (!preg_match('/\p{Ll}/u', $pw)) $miss[] = 'ein Kleinbuchstabe';
    if (!preg_match('/\d/', $pw))      $miss[] = 'eine Zahl';
    if (!preg_match('/[^\p{L}\d]/u', $pw)) $miss[] = 'ein Sonderzeichen (z. B. - ! ? #)';
    if ($miss) return 'Es fehlt noch: ' . implode(', ', $miss) . '. Beispiel: Ball-Tor-Wolke-7';
    $l = mb_strtolower($pw);
    $weak = ['12345678', '123456789', '1234567890', 'passwort', 'password', 'qwertz123', 'qwertzui', 'fussball', 'fußball',
             'heimstetten', 'lernzone', '11111111', '00000000', 'abcdefgh'];
    if (in_array($l, $weak, true) || $l === mb_strtolower($username) || preg_match('/^(.)\1+$/u', $pw)) return 'Dieses Passwort ist zu leicht zu erraten.';
    return null;
}

/* Einmal-Code wie „K7MP-3QX9“ (ohne verwechselbare Zeichen) */
function gen_code(): string {
    $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $c = '';
    for ($i = 0; $i < 8; $i++) $c .= $a[random_int(0, strlen($a) - 1)];
    return substr($c, 0, 4) . '-' . substr($c, 4);
}
function norm_code(string $c): string { return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $c) ?? ''); }

/* Neuen Einmal-Code setzen: altes Passwort ungültig, alle Sitzungen beendet */
function issue_code(int $accountId): string {
    $code = gen_code();
    pdb()->prepare('UPDATE accounts SET code_hash = ?, code_expires = ?, pw_hash = \'\', must_set_pw = 1, sess_ver = sess_ver + 1,
                   fail_count = 0, locked_until = 0 WHERE id = ?')
        ->execute([hash_pw(norm_code($code)), time() + CODE_HOURS * 3600, $accountId]);
    return $code;
}

/* Zugang eines Spielers (Trikotnummer in der gewählten Mannschaft) bzw. eines Trainers (coaches.id).
   created_at = Beitritt zur Mannschaft (für die Trainingsbeteiligung). */
function account_for(string $kind, int $ref, ?int $team = null): ?array {
    $team ??= team_id();
    $st = pdb()->prepare("SELECT a.*, m.created_at AS created_at, a.created_at AS account_created FROM accounts a
                          JOIN memberships m ON m.account_id = a.id AND m.team_id = ? AND m.role = ? AND m.ref = ?
                          WHERE a.kind = ?");
    $st->execute([(int)$team, $kind === 'coach' ? 'coach' : 'player', $ref, $kind]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

/* Kommandozeile: Mannschaft per --team=N wählen (Vorgabe: die einzige bzw. die erste) */
function cli_team(array &$argv): int {
    $id = 0;
    foreach ($argv as $i => $a) if (preg_match('/^--team=(\d+)$/', $a, $m)) { $id = (int)$m[1]; unset($argv[$i]); }
    $argv = array_values($argv);
    if (!$id) $id = (int)pdb()->query('SELECT id FROM teams WHERE active = 1 ORDER BY id LIMIT 1')->fetchColumn();
    if (!$id || !team_row($id)) { fwrite(STDERR, "Diese Mannschaft gibt es nicht (--team=N, siehe php tools/create_club.php --liste).\n"); exit(1); }
    $_SESSION['team'] = $id;
    return $id;
}

/* Neue Mannschaft in einem Verein; ihre Datenbank-Datei entsteht beim ersten Zugriff */
function create_team(int $clubId, string $name, string $season = ''): int {
    pdb()->prepare('INSERT INTO teams (club_id, name, season, db_file) VALUES (?, ?, ?, ?)')
        ->execute([$clubId, $name, $season, 'tmp-' . bin2hex(random_bytes(6)) . '.sqlite']);
    $id = (int)pdb()->lastInsertId();
    pdb()->prepare('UPDATE teams SET db_file = ? WHERE id = ?')->execute(["team-$id.sqlite", $id]);
    return $id;
}
function create_coach(string $name): int {
    pdb()->prepare("INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, '', 0)")->execute([$name]);
    return (int)pdb()->lastInsertId();
}

/* Neues Konto + Mitgliedschaft in der gewählten Mannschaft; gibt die Konto-ID zurück */
function create_account(string $username, string $kind, int $ref, bool $isAdmin = false, ?int $team = null): int {
    $team ??= team_id();
    pdb()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw, last_team) VALUES (?, ?, ?, 1, ?)")->execute([$username, $kind, $ref, (int)$team]);
    $id = (int)pdb()->lastInsertId();
    pdb()->prepare('INSERT INTO memberships (account_id, team_id, role, ref, is_admin) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, (int)$team, $kind === 'coach' ? 'coach' : 'player', $ref, $isAdmin ? 1 : 0]);
    return $id;
}

/* Mitgliedschaft in der gewählten Mannschaft beenden; Konto löschen, wenn es sonst nirgends dabei ist */
function remove_membership(int $accountId, ?int $team = null): void {
    pdb()->prepare('DELETE FROM memberships WHERE account_id = ? AND team_id = ?')->execute([$accountId, (int)($team ?? team_id())]);
    $st = pdb()->prepare('SELECT COUNT(*) FROM memberships WHERE account_id = ?'); $st->execute([$accountId]);
    if ((int)$st->fetchColumn() === 0) pdb()->prepare('DELETE FROM accounts WHERE id = ?')->execute([$accountId]);
}


/* ---------- Sitzung ---------- */

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function logout_session(): void {
    $csrf = $_SESSION['csrf'] ?? null;
    session_regenerate_id(true);
    $_SESSION = [];
    if ($csrf) $_SESSION['csrf'] = $csrf;
}

function start_session_for(array $acc, ?int $team = null): void {
    session_regenerate_id(true);
    $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'acc' => (int)$acc['id'], 'ver' => (int)$acc['sess_ver'], 'last' => time()];
    // Mannschaft: gewünschte, sonst zuletzt gewählte, sonst die erste
    $teams = array_column(account_teams((int)$acc['id']), null, 'id');
    $pick = $team && isset($teams[$team]) ? $team : (isset($teams[(int)$acc['last_team']]) ? (int)$acc['last_team'] : (int)(array_key_first($teams) ?? 0));
    if ($pick) select_team($pick, $acc);
    pdb()->prepare('UPDATE accounts SET last_login = ? WHERE id = ?')->execute([date('Y-m-d H:i'), $acc['id']]);
}

/* Mannschaft wechseln: Sitzung zeigt danach nur noch deren Daten */
function select_team(int $team, array $acc): bool {
    $st = pdb()->prepare('SELECT role, ref FROM memberships WHERE account_id = ? AND team_id = ?');
    $st->execute([(int)$acc['id'], $team]);
    $m = $st->fetch(PDO::FETCH_ASSOC);
    if (!$m || !team_row($team)) return false;
    unset($_SESSION['nr'], $_SESSION['coach']);
    $_SESSION['team'] = $team;
    if ($m['role'] === 'player') $_SESSION['nr'] = (int)$m['ref']; else $_SESSION['coach'] = (int)$m['ref'];
    pdb()->prepare('UPDATE accounts SET last_team = ? WHERE id = ?')->execute([$team, $acc['id']]);
    return true;
}

function current_account(): ?array {
    if (empty($_SESSION['acc'])) return null;
    $st = pdb()->prepare('SELECT * FROM accounts WHERE id = ?');
    $st->execute([(int)$_SESSION['acc']]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

/* Bei jedem Aufruf: alte PIN-Sitzungen beenden, gesperrte/zurückgesetzte Konten abmelden, Trainer nach 8 h Leerlauf abmelden */
function validate_session(): void {
    if ((!empty($_SESSION['nr']) || !empty($_SESSION['coach'])) && empty($_SESSION['acc'])) { logout_session(); return; }
    if (empty($_SESSION['acc'])) return;
    $a = current_account();
    if (!$a || !(int)$a['active'] || (int)$a['sess_ver'] !== (int)($_SESSION['ver'] ?? -1)) { logout_session(); return; }
    if ($a['kind'] === 'coach' && time() - (int)($_SESSION['last'] ?? 0) > COACH_IDLE) { logout_session(); return; }
    // Mitgliedschaft in der gewählten Mannschaft muss noch bestehen
    if (team_id()) {
        $st = pdb()->prepare('SELECT COUNT(*) FROM memberships WHERE account_id = ? AND team_id = ?');
        $st->execute([(int)$a['id'], team_id()]);
        if ((int)$st->fetchColumn() === 0 || !team_row(team_id())) {          // entfernt → andere Mannschaft wählen, sonst abmelden
            $other = array_values(array_filter(account_teams((int)$a['id']), fn($t) => $t['id'] !== team_id()))[0] ?? null;
            if (!$other || !select_team($other['id'], $a)) { logout_session(); return; }
        }
    }
    $_SESSION['last'] = time();
}

/* Schutz gegen gefälschte Anfragen von fremden Seiten: jede POST-Anfrage braucht das Token aus api/me.php */
function check_csrf(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
    $t = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $t)) {
        json_out(['ok' => false, 'error' => 'Deine Sitzung ist abgelaufen. Bitte lade die Seite neu.'], 403);
    }
}

function require_login(): void {
    if (empty($_SESSION['acc'])) json_out(['ok' => false, 'error' => 'Bitte melde dich an.'], 401);
}

validate_session();
check_csrf();
