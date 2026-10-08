<?php
/*
 * Trainer-Konto auf dem Server anlegen oder PIN setzen (für den echten Server ohne localhost-Zugriff).
 * Erstes Admin-Konto:   php tools/set_coach_pin.php "Stojan" 123456
 * Existiert ein Trainer mit diesem Namen, wird nur seine PIN neu gesetzt.
 * Auf XAMPP geht das Anlegen auch direkt in der App (Trainer-Bereich).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$name = trim($argv[1] ?? '');
$pin  = $argv[2] ?? '';
if ($name === '' || !preg_match('/^\d{6}$/', $pin)) exit("Aufruf: php tools/set_coach_pin.php \"Name\" 123456\n");

$root = dirname(__DIR__);
$pdo  = new PDO('sqlite:' . $root . '/storage/lernzone.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
$hash = password_hash($pin, PASSWORD_DEFAULT);
$st = $pdo->prepare('SELECT id FROM coaches WHERE name = ?');
$st->execute([$name]);
if ($id = $st->fetchColumn()) {
    $pdo->prepare('UPDATE coaches SET pin_hash = ?, active = 1, fail_count = 0, locked_until = 0 WHERE id = ?')->execute([$hash, $id]);
    echo "PIN für $name neu gesetzt.\n";
} else {
    $isFirst = (int)$pdo->query('SELECT COUNT(*) FROM coaches')->fetchColumn() === 0;
    $pdo->prepare('INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, ?, ?)')->execute([$name, $hash, $isFirst ? 1 : 0]);
    echo "Trainer $name angelegt" . ($isFirst ? ' (Admin)' : '') . ".\n";
}
