<?php
// POST {nr, pin} → {ok, user} oder {ok:false, error}
require __DIR__ . '/config.php';
require_method('POST');
check_lock('player');

$in  = json_in();
$nr  = (int)($in['nr'] ?? 0);
$pin = (string)($in['pin'] ?? '');

$st = db()->prepare('SELECT nr, pin_hash FROM players WHERE nr = ? AND active = 1');
$st->execute([$nr]);
$row = $st->fetch(PDO::FETCH_ASSOC);

if (!$row || !password_verify($pin, $row['pin_hash'])) {
    count_fail('player');
    json_out(['ok' => false, 'error' => 'PIN stimmt nicht. Frag deinen Trainer, wenn du sie vergessen hast.'], 401);
}

$coach = !empty($_SESSION['coach']);           // Trainer-Anmeldung bleibt erhalten
session_regenerate_id(true);
$_SESSION = ['nr' => (int)$row['nr']];
if ($coach) $_SESSION['coach'] = true;
json_out(['ok' => true, 'user' => current_user()]);
