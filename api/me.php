<?php
// GET → {user, coach, team:{id, name, season, club}|null, account:{username, minLen}|null, pending:{username, minLen}|null, csrf}
require __DIR__ . '/config.php';
$acc = current_account();
$pending = null;
if (!empty($_SESSION['pending']) && time() - (int)($_SESSION['pending_at'] ?? 0) <= PENDING_SECONDS) {
    $st = pdb()->prepare('SELECT username, kind FROM accounts WHERE id = ?');
    $st->execute([(int)$_SESSION['pending']]);
    $r = $st->fetch(PDO::FETCH_ASSOC) ?: ['username' => '', 'kind' => 'player'];
    $pending = ['username' => (string)$r['username'], 'minLen' => pw_min($r['kind'])];
}
json_out(['user' => current_user(), 'coach' => coach_state(), 'team' => team_info(), 'account' => $acc ? ['username' => $acc['username'], 'minLen' => pw_min($acc['kind'])] : null,
          'pending' => $pending, 'csrf' => csrf_token()]);
