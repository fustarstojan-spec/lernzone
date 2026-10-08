<?php
// GET → {user, coach, account:{username}|null, pending:{username}|null, csrf}
require __DIR__ . '/config.php';
$acc = current_account();
$pending = null;
if (!empty($_SESSION['pending']) && time() - (int)($_SESSION['pending_at'] ?? 0) <= PENDING_SECONDS) {
    $st = db()->prepare('SELECT username FROM accounts WHERE id = ?');
    $st->execute([(int)$_SESSION['pending']]);
    $pending = ['username' => (string)$st->fetchColumn()];
}
json_out(['user' => current_user(), 'coach' => coach_state(), 'account' => $acc ? ['username' => $acc['username']] : null,
          'pending' => $pending, 'csrf' => csrf_token()]);
