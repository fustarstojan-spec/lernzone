<?php
/*
 * Trainer-PIN auf dem Server setzen oder ändern (6 Ziffern).
 * Aufruf:  php tools/set_coach_pin.php 123456
 * Auf XAMPP geht das auch direkt in der App beim ersten Tippen auf das graue „+“-Trikot.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$pin = $argv[1] ?? '';
if (!preg_match('/^\d{6}$/', $pin)) exit("Bitte eine 6-stellige PIN angeben: php tools/set_coach_pin.php 123456\n");

$root = dirname(__DIR__);
$pdo  = new PDO('sqlite:' . $root . '/storage/lernzone.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
$st = $pdo->prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value');
$st->execute(['coach_pin_hash', password_hash($pin, PASSWORD_DEFAULT)]);
echo "Trainer-PIN gesetzt.\n";
