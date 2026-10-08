<?php
/*
 * Kader
 * GET                 → [{nr, pos, plan, posOff, posDef}]  (nur angemeldet)
 *                       als Trainer zusätzlich: name, consent, flag, username
 * GET ?nr=7           → Detail für Trainer: player, profile, attendance, moods, flag
 * POST {nr, type, username?, posOff?, posDef?} → neuen Spieler anlegen (Trainer) → {player, username, code}
 *      type: "tw" = Torwart (blaues Trikot), "feld" = Feldspieler (rotes Trikot); code = Einmal-Code für die erste Anmeldung
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
    require_login();
    $coach = current_coach();
    if (isset($_GET['nr'])) {
        if (!$coach) json_out(['ok' => false, 'error' => 'Nur für Trainer.'], 403);
        $nr = (int)$_GET['nr'];
        $p  = $row($nr);
        if (!$p) json_out(['ok' => false, 'error' => "Nr. $nr gibt es nicht."], 404);
        json_out(['ok' => true, 'player' => $p, 'username' => account_for('player', $nr)['username'] ?? '',
                  'profile' => (object)profile_of($nr), 'attendance' => attendance_summary($nr),
                  'moods' => recent_moods($nr, 10), 'flag' => mood_flag($nr)]);
    }
    $rows = db()->query('SELECT nr, pos, plan, pos_off, pos_def, consent FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(function ($r) use ($coach) {
        $p = player_out($r);
        if (!$coach) { unset($p['consent']); return $p; }
        $prof = profile_of($p['nr']);
        $p['name'] = trim(($prof['vorname'] ?? '') . ' ' . ($prof['nachname'] ?? ''));
        $p['flag'] = mood_flag($p['nr']);
        $p['username'] = account_for('player', $p['nr'])['username'] ?? '';
        return $p;
    }, $rows));
}

require_method('POST');
$me = require_coach();

$in     = json_in();
$action = (string)($in['action'] ?? 'add');
$nr     = int_in($in['nr'] ?? null, 1, 99);
$type   = (string)($in['type'] ?? '');
$posOff = (string)($in['posOff'] ?? '');
$posDef = (string)($in['posDef'] ?? '');

if ($nr === null) json_out(['ok' => false, 'error' => 'Die Nummer muss zwischen 1 und 99 liegen.'], 400);

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
    foreach (['progress', 'profiles', 'moods', 'attendance', 'absences', 'players'] as $t) {
        db()->prepare("DELETE FROM $t WHERE nr = ?")->execute([$nr]);
    }
    db()->prepare("DELETE FROM accounts WHERE kind = 'player' AND ref = ?")->execute([$nr]);
    json_out(['ok' => true]);
}

if ($action !== 'add') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);

$okPos = fn(string $p) => $p === '' || in_array($p, valid_positions(), true);
if (!in_array($type, ['tw', 'feld'], true))   json_out(['ok' => false, 'error' => 'Bitte Torwart oder Feldspieler wählen.'], 400);
$username = clean_username((string)($in['username'] ?? ''));
if ($username !== '' && !username_ok($username)) json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
if ($username !== '' && username_taken($username)) json_out(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.'], 409);
if (!$okPos($posOff) || !$okPos($posDef))     json_out(['ok' => false, 'error' => 'Unbekannte Position.'], 400);

$st = db()->prepare('SELECT active FROM players WHERE nr = ?');
$st->execute([$nr]);
$existing = $st->fetchColumn();
if ($existing !== false && (int)$existing === 1) json_out(['ok' => false, 'error' => "Die Nummer $nr ist schon vergeben."], 409);

$pos = $type === 'tw' ? 'Tor' : 'Feldspieler';
if ($existing !== false) {   // alte, deaktivierte Nummer
    db()->prepare('DELETE FROM players WHERE nr = ?')->execute([$nr]);
    db()->prepare("DELETE FROM accounts WHERE kind = 'player' AND ref = ?")->execute([$nr]);
}
db()->prepare("INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, '')")
    ->execute([$nr, $pos, $type, $posOff, $posDef]);
$username = $username !== '' ? $username : unique_username(db(), 'spieler' . $nr);
db()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw) VALUES (?, 'player', ?, 1)")->execute([$username, $nr]);
$code = issue_code((int)account_for('player', $nr)['id']);

json_out(['ok' => true, 'player' => $row($nr), 'username' => $username, 'code' => $code, 'expires' => date('d.m.Y', time() + CODE_DAYS * 86400)]);
