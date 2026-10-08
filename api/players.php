<?php
/*
 * Kader
 * GET                 → [{nr, pos, plan, posOff, posDef}]  (öffentlich, ohne PINs)
 *                       als Trainer zusätzlich: name, consent, flag
 * GET ?nr=7           → Detail für Trainer: player, profile, attendance, moods, flag
 * POST {nr, type, pin, posOff?, posDef?}       → neuen Spieler anlegen (Trainer)
 *      type: "tw" = Torwart (blaues Trikot), "feld" = Feldspieler (rotes Trikot); pin: 4 Ziffern
 * POST {action:"setpin", nr, pin}              → PIN ändern (Trainer)
 * POST {action:"setpos", nr, posOff, posDef}   → Positionen ändern (Trainer), Kürzel aus data/team.json
 * POST {action:"setconsent", nr, consent}      → Einwilligung der Eltern liegt vor / nicht vor (Trainer)
 * POST {action:"delete", nr}                   → Spieler mit allen Daten löschen (nur Admin)
 */
require __DIR__ . '/config.php';

$row = function (int $nr) {
    $st = db()->prepare('SELECT nr, pos, plan, pos_off, pos_def, consent FROM players WHERE nr = ? AND active = 1');
    $st->execute([$nr]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ? player_out($r) : null;
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $coach = current_coach();
    if (isset($_GET['nr'])) {
        if (!$coach) json_out(['ok' => false, 'error' => 'Nur für Trainer.'], 403);
        $nr = (int)$_GET['nr'];
        $p  = $row($nr);
        if (!$p) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
        json_out(['ok' => true, 'player' => $p, 'profile' => (object)profile_of($nr), 'attendance' => attendance_summary($nr),
                  'moods' => recent_moods($nr, 10), 'flag' => mood_flag($nr)]);
    }
    $rows = db()->query('SELECT nr, pos, plan, pos_off, pos_def, consent FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(function ($r) use ($coach) {
        $p = player_out($r);
        if (!$coach) { unset($p['consent']); return $p; }
        $prof = profile_of($p['nr']);
        $p['name'] = trim(($prof['vorname'] ?? '') . ' ' . ($prof['nachname'] ?? ''));
        $p['flag'] = mood_flag($p['nr']);
        return $p;
    }, $rows));
}

require_method('POST');
$me = require_coach();

$in     = json_in();
$action = (string)($in['action'] ?? 'add');
$nr     = int_in($in['nr'] ?? null, 1, 99);
$type   = (string)($in['type'] ?? '');
$pin    = (string)($in['pin'] ?? '');
$posOff = (string)($in['posOff'] ?? '');
$posDef = (string)($in['posDef'] ?? '');

if ($nr === null) json_out(['ok' => false, 'error' => 'Die Nummer muss zwischen 1 und 99 liegen.'], 400);

if ($action === 'setpin') {
    if (!preg_match('/^\d{4}$/', $pin)) json_out(['ok' => false, 'error' => 'Die PIN muss genau 4 Ziffern haben.'], 400);
    $st = db()->prepare('UPDATE players SET pin_hash = ?, fail_count = 0, locked_until = 0 WHERE nr = ? AND active = 1');
    $st->execute([password_hash($pin, PASSWORD_DEFAULT), $nr]);
    if ($st->rowCount() === 0) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
    json_out(['ok' => true, 'nr' => $nr]);
}

if ($action === 'setpos') {
    $okPos = fn(string $p) => $p === '' || in_array($p, valid_positions(), true);
    if (!$okPos($posOff) || !$okPos($posDef)) json_out(['ok' => false, 'error' => 'Unbekannte Position.'], 400);
    db()->prepare('UPDATE players SET pos_off = ?, pos_def = ? WHERE nr = ? AND active = 1')->execute([$posOff, $posDef, $nr]);
    $p = $row($nr);
    if (!$p) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
    json_out(['ok' => true, 'player' => $p]);
}

if ($action === 'setconsent') {
    db()->prepare('UPDATE players SET consent = ? WHERE nr = ? AND active = 1')->execute([!empty($in['consent']) ? 1 : 0, $nr]);
    $p = $row($nr);
    if (!$p) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
    json_out(['ok' => true, 'player' => $p]);
}

if ($action === 'delete') {
    if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur Admins dürfen Spieler löschen.'], 403);
    foreach (['progress', 'profiles', 'moods', 'attendance', 'players'] as $t) {
        db()->prepare("DELETE FROM $t WHERE nr = ?")->execute([$nr]);
    }
    json_out(['ok' => true]);
}

if ($action !== 'add') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);

$okPos = fn(string $p) => $p === '' || in_array($p, valid_positions(), true);
if (!in_array($type, ['tw', 'feld'], true))   json_out(['ok' => false, 'error' => 'Bitte Torwart oder Feldspieler wählen.'], 400);
if (!preg_match('/^\d{4}$/', $pin))           json_out(['ok' => false, 'error' => 'Die PIN muss genau 4 Ziffern haben.'], 400);
if (!$okPos($posOff) || !$okPos($posDef))     json_out(['ok' => false, 'error' => 'Unbekannte Position.'], 400);

$st = db()->prepare('SELECT active FROM players WHERE nr = ?');
$st->execute([$nr]);
$existing = $st->fetchColumn();
if ($existing !== false && (int)$existing === 1) json_out(['ok' => false, 'error' => "Die Nummer $nr ist schon vergeben."], 409);

$pos  = $type === 'tw' ? 'Tor' : 'Feldspieler';
$hash = password_hash($pin, PASSWORD_DEFAULT);
if ($existing !== false) db()->prepare('DELETE FROM players WHERE nr = ?')->execute([$nr]);   // alte, deaktivierte Nummer
db()->prepare('INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, ?)')
    ->execute([$nr, $pos, $type, $posOff, $posDef, $hash]);

json_out(['ok' => true, 'player' => $row($nr)]);
