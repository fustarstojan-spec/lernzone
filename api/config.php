<?php
/*
 * Lernzone API – gemeinsame Einstellungen und Hilfsfunktionen (Weg B)
 * Voraussetzung: PHP 8.1+, PDO mit SQLite (oder MySQL, siehe DSN unten).
 */
declare(strict_types=1);

// Datenbank: Standard ist eine SQLite-Datei im Ordner /storage (nicht öffentlich erreichbar machen!)
const DB_DSN  = 'sqlite:' . __DIR__ . '/../storage/lernzone.sqlite';
const DB_USER = null;   // für MySQL z. B. 'lernzone'
const DB_PASS = null;

const MAX_LOGIN_TRIES = 5;      // Fehlversuche pro Konto (und pro Sitzung) …
const LOCK_SECONDS    = 300;    // … danach 5 Minuten Sperre
const COACH_IDLE      = 8 * 3600;   // Trainer nach 8 Stunden ohne Aktivität abmelden
const CODE_DAYS       = 7;          // Einmal-Codes sind 7 Tage gültig
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

/* ---------- Datenbank ---------- */

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec(file_get_contents(__DIR__ . '/../tools/schema.sql'));   // legt fehlende Tabellen an
        migrate($pdo);
        seed_demo_players($pdo);
        ensure_accounts($pdo);
    }
    return $pdo;
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
    // Bis 0.6.0 gab es nur eine Trainer-PIN → wird zum ersten Admin-Konto „Trainer“
    $old = $pdo->query("SELECT value FROM settings WHERE name = 'coach_pin_hash'")->fetchColumn();
    if ($old !== false) {
        if ((int)$pdo->query('SELECT COUNT(*) FROM coaches')->fetchColumn() === 0) {
            $pdo->prepare('INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, ?, 1)')->execute(['Trainer', $old]);
        }
        $pdo->exec("DELETE FROM settings WHERE name = 'coach_pin_hash'");
    }
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
    if (empty($_SESSION['nr'])) return null;
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

function current_coach(): ?array {
    if (empty($_SESSION['coach'])) return null;
    $st = db()->prepare('SELECT id, name, is_admin FROM coaches WHERE id = ? AND active = 1');
    $st->execute([(int)$_SESSION['coach']]);
    $c = $st->fetch(PDO::FETCH_ASSOC);
    return $c ? ['id' => (int)$c['id'], 'name' => $c['name'], 'isAdmin' => (bool)$c['is_admin']] : null;
}

function coach_state(): array {
    $c = current_coach();
    $has = (int)db()->query('SELECT COUNT(*) FROM coaches WHERE active = 1')->fetchColumn() > 0;
    return [
        'active'     => $c !== null,
        'id'         => $c['id'] ?? null,
        'name'       => $c['name'] ?? null,
        'isAdmin'    => $c['isAdmin'] ?? false,
        'hasCoaches' => $has,
        'canSetup'   => !$has && is_local_request(),   // erstes Admin-Konto nur auf localhost anlegen
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
    $st = db()->prepare("SELECT locked_until FROM $table WHERE $key = ?");
    $st->execute([$id]);
    return (int)$st->fetchColumn() > time();
}
function account_fail(string $table, string $key, int $id): void {
    db()->prepare("UPDATE $table SET fail_count = fail_count + 1 WHERE $key = ?")->execute([$id]);
    db()->prepare("UPDATE $table SET locked_until = ?, fail_count = 0 WHERE $key = ? AND fail_count >= ?")
        ->execute([time() + LOCK_SECONDS, $id, MAX_LOGIN_TRIES]);
}
function account_ok(string $table, string $key, int $id): void {
    db()->prepare("UPDATE $table SET fail_count = 0, locked_until = 0 WHERE $key = ?")->execute([$id]);
}

/* ---------- Trainings, Beteiligung, Befinden ---------- */

/* Trainingsbeteiligung: alle Trainings (nur Art „training“) seit der Aufnahme in den Kader bis heute; last = die letzten 20 (alt → neu) */
function attendance_summary(int $nr): array {
    // Gezählt wird ab Saisonbeginn (Einstellung) bzw. ab dem Tag, an dem das Konto angelegt wurde – das spätere Datum.
    // Nur Trainings, bei denen der Trainer die Anwesenheit eingetragen hat (mindestens einer da), zählen.
    $since = substr((string)(account_for('player', $nr)['created_at'] ?? '2000-01-01'), 0, 10);
    $season = (string)(db()->query("SELECT value FROM settings WHERE name = 'season_start'")->fetchColumn() ?: '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $season) && $season > $since) $since = $season;
    $st = db()->prepare('SELECT t.id, t.date, CASE WHEN a.nr IS NULL THEN 0 ELSE 1 END AS present
                         FROM trainings t LEFT JOIN attendance a ON a.training_id = t.id AND a.nr = ?
                         WHERE t.date <= ? AND t.date >= ? AND t.kind = \'training\'
                           AND EXISTS (SELECT 1 FROM attendance x WHERE x.training_id = t.id)
                         ORDER BY t.date DESC, t.time DESC');
    $st->execute([$nr, today(), $since]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $attended = count(array_filter($rows, fn($r) => (int)$r['present'] === 1));
    $last = array_reverse(array_slice($rows, 0, 20));
    return ['total' => count($rows), 'attended' => $attended,
            'last' => array_map(fn($r) => ['date' => $r['date'], 'present' => (bool)$r['present']], $last)];
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
    $st = db()->prepare('SELECT COUNT(*) FROM accounts WHERE username = ? AND id != ?');
    $st->execute([$u, $exceptId]);
    return (int)$st->fetchColumn() > 0;
}
function unique_username(PDO $pdo, string $base): string {
    $base = username_ok($base) ? $base : 'user';
    $u = $base; $i = 2;
    $st = $pdo->prepare('SELECT COUNT(*) FROM accounts WHERE username = ?');
    while (true) { $st->execute([$u]); if ((int)$st->fetchColumn() === 0) return $u; $u = $base . $i++; }
}

/* Passwort-Regeln: mindestens 8 Zeichen, nicht der Benutzername, keine Allerwelts-Passwörter */
function pw_problem(string $pw, string $username): ?string {
    if (mb_strlen($pw) < 8)   return 'Das Passwort muss mindestens 8 Zeichen haben.';
    if (mb_strlen($pw) > 200) return 'Das Passwort ist zu lang.';
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
    db()->prepare('UPDATE accounts SET code_hash = ?, code_expires = ?, pw_hash = \'\', must_set_pw = 1, sess_ver = sess_ver + 1,
                   fail_count = 0, locked_until = 0 WHERE id = ?')
        ->execute([hash_pw(norm_code($code)), time() + CODE_DAYS * 86400, $accountId]);
    return $code;
}

function account_for(string $kind, int $ref): ?array {
    $st = db()->prepare('SELECT * FROM accounts WHERE kind = ? AND ref = ?');
    $st->execute([$kind, $ref]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

/* Bis 0.7.0 gab es nur PINs: jedes Konto ohne Zugang bekommt einen.
   Benutzername spielerNN bzw. Vorname des Trainers; die alte PIN gilt einmalig, danach muss ein Passwort festgelegt werden. */
function ensure_accounts(PDO $pdo): void {
    // created_at weit zurück, damit bisherige Trainings in der Trainingsbeteiligung mitzählen
    $ins = $pdo->prepare("INSERT INTO accounts (username, kind, ref, pw_hash, must_set_pw, created_at) VALUES (?, ?, ?, ?, 1, '2000-01-01 00:00:00')");
    $rows = $pdo->query("SELECT p.nr, p.pin_hash FROM players p LEFT JOIN accounts a ON a.kind = 'player' AND a.ref = p.nr
                         WHERE a.id IS NULL AND p.pin_hash != ''")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) $ins->execute([unique_username($pdo, 'spieler' . $r['nr']), 'player', $r['nr'], $r['pin_hash']]);
    $rows = $pdo->query("SELECT c.id, c.name, c.pin_hash FROM coaches c LEFT JOIN accounts a ON a.kind = 'coach' AND a.ref = c.id
                         WHERE a.id IS NULL AND c.pin_hash != ''")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        $base = clean_username((string)$r['name']);
        $ins->execute([unique_username($pdo, username_ok($base) ? $base : 'trainer'), 'coach', $r['id'], $r['pin_hash']]);
    }
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

function start_session_for(array $acc): void {
    session_regenerate_id(true);
    $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'acc' => (int)$acc['id'], 'ver' => (int)$acc['sess_ver'], 'last' => time()];
    if ($acc['kind'] === 'player') $_SESSION['nr'] = (int)$acc['ref'];
    else $_SESSION['coach'] = (int)$acc['ref'];
    db()->prepare('UPDATE accounts SET last_login = ? WHERE id = ?')->execute([date('Y-m-d H:i'), $acc['id']]);
}

function current_account(): ?array {
    if (empty($_SESSION['acc'])) return null;
    $st = db()->prepare('SELECT * FROM accounts WHERE id = ?');
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
