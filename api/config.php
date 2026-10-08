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

date_default_timezone_set('Europe/Berlin');

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,   // 30 Tage angemeldet bleiben
    'path'     => '/',
    'secure'   => !empty($_SERVER['HTTPS']),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/* ---------- Datenbank ---------- */

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec(file_get_contents(__DIR__ . '/../tools/schema.sql'));   // legt fehlende Tabellen an
        migrate($pdo);
        seed_demo_players($pdo);
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

/* Trainingsbeteiligung: alle Trainings bis heute; last = die letzten 20 (alt → neu) */
function attendance_summary(int $nr): array {
    $st = db()->prepare('SELECT t.id, t.date, CASE WHEN a.nr IS NULL THEN 0 ELSE 1 END AS present
                         FROM trainings t LEFT JOIN attendance a ON a.training_id = t.id AND a.nr = ?
                         WHERE t.date <= ? ORDER BY t.date DESC, t.time DESC');
    $st->execute([$nr, today()]);
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
