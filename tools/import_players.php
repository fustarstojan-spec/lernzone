<?php
/*
 * Legt die Datenbank an, übernimmt den Kader aus data/players.json
 * und vergibt jedem Spieler eine neue zufällige 4-stellige PIN.
 *
 * Aufruf auf der Kommandozeile:  php tools/import_players.php
 * Die PIN-Liste wird EINMAL ausgegeben – ausdrucken, verteilen, nicht speichern.
 * Einzelne PIN neu setzen:       php tools/import_players.php 7
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }

$root = dirname(__DIR__);
$pdo  = new PDO('sqlite:' . $root . '/storage/lernzone.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));

$players = json_decode(file_get_contents($root . '/data/players.json'), true);
$only    = isset($argv[1]) ? (int)$argv[1] : null;

$cols = array_column($pdo->query('PRAGMA table_info(players)')->fetchAll(PDO::FETCH_ASSOC), 'name');
foreach (['pos_off', 'pos_def'] as $c) if (!in_array($c, $cols, true)) $pdo->exec("ALTER TABLE players ADD COLUMN $c TEXT NOT NULL DEFAULT ''");
$st = $pdo->prepare('INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(nr) DO UPDATE SET pos = excluded.pos, plan = excluded.plan, pos_off = excluded.pos_off,
                     pos_def = excluded.pos_def, pin_hash = excluded.pin_hash');

echo "Nr.  PIN\n---------\n";
foreach ($players as $p) {
    if ($only !== null && $p['nr'] !== $only) continue;
    $pin = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    $st->execute([$p['nr'], $p['pos'], $p['plan'], $p['posOff'] ?? '', $p['posDef'] ?? '', password_hash($pin, PASSWORD_DEFAULT)]);
    printf("%-4d %s\n", $p['nr'], $pin);
}
