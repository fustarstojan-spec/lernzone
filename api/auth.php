<?php
/*
 * Anmeldung (ab 0.8.0)
 * POST {action:"login",  username, password}         → {ok, state:"ok", user, coach} oder {ok, state:"setpw"}
 *        password kann auch der Einmal-Code vom Trainer sein → danach eigenes Passwort festlegen
 * POST {action:"setpw",  password, password2}        → eigenes Passwort festlegen (nach Einmal-Code / erster Anmeldung)
 * POST {action:"change", old, password, password2}   → Passwort ändern (angemeldet; andere Geräte werden abgemeldet)
 * POST {action:"setup",  club, team, name, username, password, password2} → erster Verein + Mannschaft + Admin-Konto
 *        (nur solange es noch keine Mannschaft gibt und nur auf localhost; das Konto wird Superadmin, Vereinsadmin und Cheftrainer)
 * POST {action:"logout"}
 * Alle Antworten bei Erfolg enthalten das neue CSRF-Token.
 */
require __DIR__ . '/config.php';
require_method('POST');

$in     = json_in();
$action = (string)($in['action'] ?? '');
const DUMMY_HASH = '$2y$10$qDT3H.8TpDKmxurdx.PDo.1RqLj1.RwhVLH5mmnU9xqBB.XhVU/c6';   // echter Hash eines Platzhalters

$done = function (): never {
    json_out(['ok' => true, 'state' => 'ok', 'user' => current_user(), 'coach' => coach_state(), 'csrf' => csrf_token(),
              'account' => ['username' => current_account()['username'] ?? '', 'minLen' => pw_min(current_account()['kind'] ?? 'player')]]);
};
/* Konto darf sich anmelden, wenn es in mindestens einer aktiven Mannschaft dabei (und dort aktiv) ist */
$entityActive = function (array $a): bool {
    if ($a['kind'] === 'coach') {
        $st = pdb()->prepare('SELECT active FROM coaches WHERE id = ?'); $st->execute([(int)$a['ref']]);
        if ((int)$st->fetchColumn() !== 1) return false;
        if (!empty($a['platform_admin']) || admin_clubs($a)) return true;                                     // Superadmin / Vereinsadmin (auch ohne Mannschaft)
    }
    $st = pdb()->prepare('SELECT team_id, ref FROM memberships WHERE account_id = ?'); $st->execute([(int)$a['id']]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $m) {
        if (!team_row((int)$m['team_id'])) continue;
        if ($a['kind'] === 'coach') return true;
        $p = db((int)$m['team_id'])->prepare('SELECT active FROM players WHERE nr = ?'); $p->execute([(int)$m['ref']]);
        if ((int)$p->fetchColumn() === 1) return true;
    }
    return false;
};
$setPassword = function (array $a, string $pw, string $pw2) {
    if ($pw !== $pw2) json_out(['ok' => false, 'error' => 'Die beiden Passwörter sind nicht gleich.'], 400);
    if ($p = pw_problem($pw, $a['username'], $a['kind'])) json_out(['ok' => false, 'error' => $p], 400);
    pdb()->prepare("UPDATE accounts SET pw_hash = ?, must_set_pw = 0, code_hash = '', code_expires = 0, sess_ver = sess_ver + 1 WHERE id = ?")
        ->execute([hash_pw($pw), $a['id']]);
    $st = pdb()->prepare('SELECT * FROM accounts WHERE id = ?'); $st->execute([$a['id']]);
    return $st->fetch(PDO::FETCH_ASSOC);
};

if ($action === 'logout') { logout_session(); json_out(['ok' => true, 'csrf' => csrf_token()]); }

if ($action === 'login') {
    check_lock('login');
    $u  = clean_username((string)($in['username'] ?? ''));
    $pw = (string)($in['password'] ?? '');
    $st = pdb()->prepare('SELECT * FROM accounts WHERE username = ? AND active = 1');
    $st->execute([$u]);
    $a = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($a && (int)$a['locked_until'] > time()) json_out(['ok' => false, 'error' => 'Zu viele falsche Versuche. Warte 5 Minuten.'], 429);

    $via = null;
    if (!$a) password_verify($pw, DUMMY_HASH);                       // gleiche Antwortzeit, ob es den Namen gibt oder nicht
    elseif ($a['pw_hash'] !== '' && password_verify($pw, $a['pw_hash'])) $via = 'pw';
    elseif ($a['code_hash'] !== '' && (int)$a['code_expires'] > time() && password_verify(norm_code($pw), $a['code_hash'])) $via = 'code';

    if (!$via || !$entityActive($a)) {
        count_fail('login');
        if ($a) account_fail('accounts', 'id', (int)$a['id']);
        json_out(['ok' => false, 'error' => 'Benutzername oder Passwort stimmt nicht.'], 401);
    }
    account_ok('accounts', 'id', (int)$a['id']);

    if ($via === 'code' || (int)$a['must_set_pw'] === 1) {
        session_regenerate_id(true);
        $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'pending' => (int)$a['id'], 'pending_at' => time()];
        json_out(['ok' => true, 'state' => 'setpw', 'username' => $a['username'], 'minLen' => pw_min($a['kind']), 'csrf' => csrf_token()]);
    }
    if (password_needs_rehash($a['pw_hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        pdb()->prepare('UPDATE accounts SET pw_hash = ? WHERE id = ?')->execute([hash_pw($pw), $a['id']]);
    }
    start_session_for($a);
    $done();
}

if ($action === 'setpw') {
    $id = (int)($_SESSION['pending'] ?? 0);
    if (!$id || time() - (int)($_SESSION['pending_at'] ?? 0) > PENDING_SECONDS) {
        logout_session();
        json_out(['ok' => false, 'error' => 'Das hat zu lange gedauert. Bitte melde dich noch einmal an.', 'csrf' => csrf_token()], 401);
    }
    $st = pdb()->prepare('SELECT * FROM accounts WHERE id = ? AND active = 1'); $st->execute([$id]);
    $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a) { logout_session(); json_out(['ok' => false, 'error' => 'Bitte melde dich noch einmal an.'], 401); }
    $a = $setPassword($a, (string)($in['password'] ?? ''), (string)($in['password2'] ?? ''));
    start_session_for($a);
    $done();
}

if ($action === 'change') {
    require_login();
    $a = current_account();
    if ($a['pw_hash'] === '' || !password_verify((string)($in['old'] ?? ''), $a['pw_hash'])) {
        account_fail('accounts', 'id', (int)$a['id']);
        json_out(['ok' => false, 'error' => 'Dein bisheriges Passwort stimmt nicht.'], 400);
    }
    $team = team_id();
    $a = $setPassword($a, (string)($in['password'] ?? ''), (string)($in['password2'] ?? ''));
    start_session_for($a, $team);          // dieses Gerät bleibt angemeldet (gleiche Mannschaft), alle anderen nicht
    $done();
}

if ($action === 'setup') {
    if (!coach_state()['canSetup']) json_out(['ok' => false, 'error' => 'Das erste Trainer-Konto kann hier nicht angelegt werden.'], 403);
    $club = clean_text($in['club'] ?? '', 60);
    $tname = clean_text($in['team'] ?? '', 40);
    if ($club === '' || $tname === '') json_out(['ok' => false, 'error' => 'Bitte Verein und Mannschaft eingeben.'], 400);
    $name = clean_text($in['name'] ?? '', 30);
    $u    = clean_username((string)($in['username'] ?? ''));
    if ($name === '')       json_out(['ok' => false, 'error' => 'Bitte deinen Vornamen eingeben.'], 400);
    if (!username_ok($u))   json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
    if (username_taken($u)) json_out(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.'], 409);
    $pw = (string)($in['password'] ?? '');
    if ($pw !== (string)($in['password2'] ?? '')) json_out(['ok' => false, 'error' => 'Die beiden Passwörter sind nicht gleich.'], 400);
    if ($p = pw_problem($pw, $u, 'coach')) json_out(['ok' => false, 'error' => $p], 400);
    pdb()->prepare('INSERT INTO clubs (name) VALUES (?)')->execute([$club]);
    $team = create_team((int)pdb()->lastInsertId(), $tname);
    $cid = create_coach($name);
    $aid = create_account($u, 'coach', $cid, true, $team);
    pdb()->prepare('UPDATE accounts SET pw_hash = ?, must_set_pw = 0, platform_admin = 1 WHERE id = ?')->execute([hash_pw($pw), $aid]);
    pdb()->prepare('INSERT INTO club_admins (account_id, club_id) VALUES (?, (SELECT club_id FROM teams WHERE id = ?))')->execute([$aid, $team]);
    $st = pdb()->prepare('SELECT * FROM accounts WHERE id = ?'); $st->execute([$aid]);
    start_session_for($st->fetch(PDO::FETCH_ASSOC), $team);
    $done();
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
