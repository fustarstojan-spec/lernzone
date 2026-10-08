<?php
/*
 * Kader
 * GET                         → [{nr, pos, plan}]  (öffentlich, ohne PINs)
 * POST {nr, type, pin}        → neuen Spieler anlegen (nur Trainer)
 *      type: "tw" = Torwart (blaues Trikot), "feld" = Feldspieler (rotes Trikot)
 *      pin:  4 Ziffern
 */
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = db()->query('SELECT nr, pos, plan FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(fn($r) => ['nr' => (int)$r['nr'], 'pos' => $r['pos'], 'plan' => $r['plan']], $rows));
}

require_method('POST');
require_coach();

$in   = json_in();
$nr   = filter_var($in['nr'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]);
$type = (string)($in['type'] ?? '');
$pin  = (string)($in['pin'] ?? '');

if ($nr === false)                       json_out(['ok' => false, 'error' => 'Die Nummer muss zwischen 1 und 99 liegen.'], 400);
if (!in_array($type, ['tw', 'feld'], true)) json_out(['ok' => false, 'error' => 'Bitte Torwart oder Feldspieler wählen.'], 400);
if (!preg_match('/^\d{4}$/', $pin))      json_out(['ok' => false, 'error' => 'Die PIN muss genau 4 Ziffern haben.'], 400);

$st = db()->prepare('SELECT active FROM players WHERE nr = ?');
$st->execute([$nr]);
$existing = $st->fetchColumn();
if ($existing !== false && (int)$existing === 1) json_out(['ok' => false, 'error' => "Die Nummer $nr ist schon vergeben."], 409);

$pos  = $type === 'tw' ? 'Tor' : 'Feldspieler';
$hash = password_hash($pin, PASSWORD_DEFAULT);

if ($existing !== false) {       // früher vergebene, deaktivierte Nummer neu belegen
    $st = db()->prepare('UPDATE players SET pos = ?, plan = ?, pin_hash = ?, active = 1 WHERE nr = ?');
    $st->execute([$pos, $type, $hash, $nr]);
    db()->prepare('DELETE FROM progress WHERE nr = ?')->execute([$nr]);
} else {
    $st = db()->prepare('INSERT INTO players (nr, pos, plan, pin_hash) VALUES (?, ?, ?, ?)');
    $st->execute([$nr, $pos, $type, $hash]);
}

json_out(['ok' => true, 'player' => ['nr' => $nr, 'pos' => $pos, 'plan' => $type]]);
