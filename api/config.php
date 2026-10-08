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
    }
    return $pdo;
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
