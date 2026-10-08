<?php
/*
 * Kader
 * GET                         → [{nr, pos, plan}]  (öffentlich, ohne PINs)
 * POST {nr, type, pin, posOff?, posDef?} → neuen Spieler anlegen (nur Trainer)
 *      type: "tw" = Torwart (blaues Trikot), "feld" = Feldspieler (rotes Trikot)
 *      pin:  4 Ziffern
 * POST {action:"setpin", nr, pin}        → PIN eines Spielers ändern (nur Trainer)
 * POST {action:"setpos", nr, posOff, posDef} → Positionen ändern (nur Trainer), Kürzel aus data/team.json
 */
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = db()->query('SELECT nr, pos, plan, pos_off, pos_def FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map('player_out', $rows));
}

require_method('POST');
require_coach();

$in     = json_in();
$action = (string)($in['action'] ?? 'add');
$nr     = filter_var($in['nr'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]);
$type   = (string)($in['type'] ?? '');
$pin    = (string)($in['pin'] ?? '');
$posOff = (string)($in['posOff'] ?? '');
$posDef = (string)($in['posDef'] ?? '');
$okPos  = fn(string $p) => $p === '' || in_array($p, valid_positions(), true);
if (!$okPos($posOff) || !$okPos($posDef)) json_out(['ok' => false, 'error' => 'Unbekannte Position.'], 400);

if ($nr === false)                       json_out(['ok' => false, 'error' => 'Die Nummer muss zwischen 1 und 99 liegen.'], 400);

if ($action === 'setpin') {
    if (!preg_match('/^\d{4}$/', $pin)) json_out(['ok' => false, 'error' => 'Die PIN muss genau 4 Ziffern haben.'], 400);
    $st = db()->prepare('UPDATE players SET pin_hash = ? WHERE nr = ? AND active = 1');
    $st->execute([password_hash($pin, PASSWORD_DEFAULT), $nr]);
    if ($st->rowCount() === 0) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
    json_out(['ok' => true, 'nr' => $nr]);
}
if ($action === 'setpos') {
    $st = db()->prepare('UPDATE players SET pos_off = ?, pos_def = ? WHERE nr = ? AND active = 1');
    $st->execute([$posOff, $posDef, $nr]);
    $chk = db()->prepare('SELECT nr, pos, plan, pos_off, pos_def FROM players WHERE nr = ? AND active = 1');
    $chk->execute([$nr]);
    $row = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$row) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
    json_out(['ok' => true, 'player' => player_out($row)]);
}
if ($action !== 'add') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);

if (!in_array($type, ['tw', 'feld'], true)) json_out(['ok' => false, 'error' => 'Bitte Torwart oder Feldspieler wählen.'], 400);
if (!preg_match('/^\d{4}$/', $pin))      json_out(['ok' => false, 'error' => 'Die PIN muss genau 4 Ziffern haben.'], 400);

$st = db()->prepare('SELECT active FROM players WHERE nr = ?');
$st->execute([$nr]);
$existing = $st->fetchColumn();
if ($existing !== false && (int)$existing === 1) json_out(['ok' => false, 'error' => "Die Nummer $nr ist schon vergeben."], 409);

$pos  = $type === 'tw' ? 'Tor' : 'Feldspieler';
$hash = password_hash($pin, PASSWORD_DEFAULT);

if ($existing !== false) {       // früher vergebene, deaktivierte Nummer neu belegen
    $st = db()->prepare('UPDATE players SET pos = ?, plan = ?, pos_off = ?, pos_def = ?, pin_hash = ?, active = 1 WHERE nr = ?');
    $st->execute([$pos, $type, $posOff, $posDef, $hash, $nr]);
    db()->prepare('DELETE FROM progress WHERE nr = ?')->execute([$nr]);
} else {
    $st = db()->prepare('INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, ?)');
    $st->execute([$nr, $pos, $type, $posOff, $posDef, $hash]);
}

json_out(['ok' => true, 'player' => ['nr' => $nr, 'pos' => $pos, 'plan' => $type, 'posOff' => $posOff, 'posDef' => $posDef]]);
