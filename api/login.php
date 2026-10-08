<?php
// POST {nr, pin} → {ok, user} oder {ok:false, error}
require __DIR__ . '/config.php';
require_method('POST');

if (($_SESSION['locked_until'] ?? 0) > time()) {
    json_out(['ok' => false, 'error' => 'Zu viele Versuche. Warte ein paar Minuten.'], 429);
}

$in  = json_in();
$nr  = (int)($in['nr'] ?? 0);
$pin = (string)($in['pin'] ?? '');

$st = db()->prepare('SELECT nr, pin_hash FROM players WHERE nr = ? AND active = 1');
$st->execute([$nr]);
$row = $st->fetch(PDO::FETCH_ASSOC);

if (!$row || !password_verify($pin, $row['pin_hash'])) {
    $_SESSION['tries'] = ($_SESSION['tries'] ?? 0) + 1;
    if ($_SESSION['tries'] >= MAX_LOGIN_TRIES) {
        $_SESSION['locked_until'] = time() + LOCK_SECONDS;
        $_SESSION['tries'] = 0;
    }
    json_out(['ok' => false, 'error' => 'PIN stimmt nicht. Frag deinen Trainer, wenn du sie vergessen hast.'], 401);
}

session_regenerate_id(true);
$_SESSION = ['nr' => (int)$row['nr']];
json_out(['ok' => true, 'user' => current_user()]);
