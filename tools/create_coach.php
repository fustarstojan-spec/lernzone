<?php
/*
 * Trainer-Konto auf dem Server anlegen (für den echten Server, wo das Einrichten über die App gesperrt ist).
 *   php tools/create_coach.php "Vorname" benutzername
 * Gibt einen Einmal-Code aus (72 Stunden gültig). Damit meldet sich der Trainer an und legt sein Passwort fest.
 * Das erste Konto wird automatisch Admin. Existiert der Benutzername schon, bekommt er nur einen neuen Code.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';   // nutzt dieselben Funktionen wie die App
ob_end_clean();

$name = trim($argv[1] ?? '');
$user = clean_username($argv[2] ?? '');
if ($name === '' || !username_ok($user)) exit("Aufruf: php tools/create_coach.php \"Vorname\" benutzername\n");

if ($a = db()->query('SELECT * FROM accounts WHERE username = ' . db()->quote($user))->fetch(PDO::FETCH_ASSOC)) {
    echo "Neuer Einmal-Code für $user: " . issue_code((int)$a['id']) . "\n";
    exit;
}
$first = (int)db()->query('SELECT COUNT(*) FROM coaches WHERE active = 1')->fetchColumn() === 0;
db()->prepare("INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, '', ?)")->execute([$name, $first ? 1 : 0]);
$cid = (int)db()->lastInsertId();
db()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw) VALUES (?, 'coach', ?, 1)")->execute([$user, $cid]);
echo "Trainer $name angelegt" . ($first ? ' (Admin)' : '') . ".\nBenutzername: $user\nEinmal-Code:  " . issue_code((int)account_for('coach', $cid)['id']) . "  (72 Stunden gültig)\n";
