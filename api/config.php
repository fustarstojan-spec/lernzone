<?php
/*
 * Lernzone API – gemeinsame Einstellungen (Weg B)
 * Voraussetzung: PHP 8+, PDO mit SQLite (oder MySQL, siehe DSN unten).
 */
declare(strict_types=1);

// Datenbank: Standard ist eine SQLite-Datei im Ordner /storage (nicht öffentlich erreichbar machen!)
const DB_DSN  = 'sqlite:' . __DIR__ . '/../storage/lernzone.sqlite';
const DB_USER = null;   // für MySQL z. B. 'lernzone'
const DB_PASS = null;

const MAX_LOGIN_TRIES = 5;      // Fehlversuche pro Sitzung …
const LOCK_SECONDS    = 300;    // … danach 5 Minuten Sperre

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

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec(file_get_contents(__DIR__ . '/../tools/schema.sql'));   // legt fehlende Tabellen an
        seed_demo_players($pdo);
    }
    return $pdo;
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
    $st = $pdo->prepare('INSERT INTO players (nr, pos, plan, pin_hash) VALUES (?, ?, ?, ?)');
    foreach ($players as $p) {
        if (!isset($pins[(string)$p['nr']])) continue;
        $st->execute([$p['nr'], $p['pos'], $p['plan'], password_hash((string)$pins[(string)$p['nr']], PASSWORD_DEFAULT)]);
    }
}

function setting(string $name): ?string {
    $st = db()->prepare('SELECT value FROM settings WHERE name = ?');
    $st->execute([$name]);
    $v = $st->fetchColumn();
    return $v === false ? null : (string)$v;
}

function set_setting(string $name, string $value): void {
    $st = db()->prepare('INSERT INTO settings (name, value) VALUES (?, ?)
                         ON CONFLICT(name) DO UPDATE SET value = excluded.value');
    $st->execute([$name, $value]);
}

/* Anfrage kommt vom selben Rechner (XAMPP / localhost) */
function is_local_request(): bool {
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

function coach_state(): array {
    $hasPin = setting('coach_pin_hash') !== null;
    return [
        'active'   => !empty($_SESSION['coach']),
        'hasPin'   => $hasPin,
        'canSetup' => !$hasPin && is_local_request(),
    ];
}

function require_coach(): void {
    if (empty($_SESSION['coach'])) json_out(['ok' => false, 'error' => 'Nur für Trainer.'], 403);
}

/* Fehlversuche pro Sitzung zählen (getrennt für Spieler und Trainer) */
function check_lock(string $k): void {
    if (($_SESSION[$k . '_locked_until'] ?? 0) > time()) {
        json_out(['ok' => false, 'error' => 'Zu viele Versuche. Warte ein paar Minuten.'], 429);
    }
}
function count_fail(string $k): void {
    $_SESSION[$k . '_tries'] = ($_SESSION[$k . '_tries'] ?? 0) + 1;
    if ($_SESSION[$k . '_tries'] >= MAX_LOGIN_TRIES) {
        $_SESSION[$k . '_locked_until'] = time() + LOCK_SECONDS;
        $_SESSION[$k . '_tries'] = 0;
    }
}

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

function current_user(): ?array {
    if (empty($_SESSION['nr'])) return null;
    $st = db()->prepare('SELECT nr, pos, plan FROM players WHERE nr = ? AND active = 1');
    $st->execute([$_SESSION['nr']]);
    $u = $st->fetch(PDO::FETCH_ASSOC);
    return $u ? ['nr' => (int)$u['nr'], 'pos' => $u['pos'], 'plan' => $u['plan']] : null;
}

function require_user(): array {
    $u = current_user();
    if (!$u) json_out(['ok' => false, 'error' => 'Nicht angemeldet'], 401);
    return $u;
}
