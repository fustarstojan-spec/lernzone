<?php
/*
 * Zugänge verwalten (Trainer)
 * POST {action:"code",   kind:"player"|"coach", ref}            → neuer Einmal-Code (7 Tage gültig); altes Passwort ungültig
 * POST {action:"rename", kind:"player"|"coach", ref, username}  → Benutzernamen ändern
 * Spieler: jeder Trainer. Trainer-Konten: Admin, den eigenen Benutzernamen auch man selbst.
 */
require __DIR__ . '/config.php';
require_method('POST');
$me = require_coach();

$in   = json_in();
$kind = (string)($in['kind'] ?? '');
$ref  = (int)($in['ref'] ?? 0);
if (!in_array($kind, ['player', 'coach'], true)) json_out(['ok' => false, 'error' => 'Unbekannte Art von Konto.'], 400);
if ($kind === 'coach' && !$me['isAdmin'] && !($ref === $me['id'] && ($in['action'] ?? '') === 'rename')) {
    json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
}
$a = account_for($kind, $ref);
if (!$a) json_out(['ok' => false, 'error' => 'Dieses Konto gibt es nicht.'], 404);

switch ($in['action'] ?? '') {
    case 'code':
        $code = issue_code((int)$a['id']);
        json_out(['ok' => true, 'username' => $a['username'], 'code' => $code, 'expires' => date('d.m.Y', time() + CODE_DAYS * 86400)]);
    case 'rename':
        $u = clean_username((string)($in['username'] ?? ''));
        if (!username_ok($u))                  json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
        if (username_taken($u, (int)$a['id'])) json_out(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.'], 409);
        db()->prepare('UPDATE accounts SET username = ? WHERE id = ?')->execute([$u, $a['id']]);
        json_out(['ok' => true, 'username' => $u]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
