<?php
/*
 * Trainer-Anmeldung
 * POST {action:"login",  id, pin}    → anmelden (id aus api/coaches.php)
 * POST {action:"setup",  name, pin}  → erstes Admin-Konto anlegen (nur wenn noch kein Trainer existiert
 *                                      UND die Anfrage vom selben Rechner kommt, z. B. XAMPP)
 * POST {action:"logout"}             → abmelden
 * Antwort: {ok, coach:{active, id, name, isAdmin, hasCoaches, canSetup}} oder {ok:false, error}
 */
require __DIR__ . '/config.php';
require_method('POST');

$in     = json_in();
$action = (string)($in['action'] ?? '');
$pin    = (string)($in['pin'] ?? '');

if ($action === 'logout') {
    unset($_SESSION['coach']);
    json_out(['ok' => true, 'coach' => coach_state()]);
}

if (!preg_match('/^\d{6}$/', $pin)) json_out(['ok' => false, 'error' => 'Die Trainer-PIN hat 6 Ziffern.'], 400);

if ($action === 'setup') {
    if (!coach_state()['canSetup']) json_out(['ok' => false, 'error' => 'Das erste Trainer-Konto kann hier nicht angelegt werden.'], 403);
    $name = clean_text($in['name'] ?? '', 30);
    if ($name === '') json_out(['ok' => false, 'error' => 'Bitte deinen Namen eingeben.'], 400);
    db()->prepare('INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, ?, 1)')->execute([$name, password_hash($pin, PASSWORD_DEFAULT)]);
    session_regenerate_id(true);
    $_SESSION['coach'] = (int)db()->lastInsertId();
    json_out(['ok' => true, 'coach' => coach_state()]);
}

if ($action === 'login') {
    check_lock('coach');
    $id = (int)($in['id'] ?? 0);
    if (account_locked('coaches', 'id', $id)) json_out(['ok' => false, 'error' => 'Zu viele falsche Versuche. Warte 5 Minuten.'], 429);
    $st = db()->prepare('SELECT pin_hash FROM coaches WHERE id = ? AND active = 1');
    $st->execute([$id]);
    $hash = $st->fetchColumn();
    if ($hash === false || !password_verify($pin, (string)$hash)) {
        count_fail('coach');
        if ($hash !== false) account_fail('coaches', 'id', $id);
        json_out(['ok' => false, 'error' => 'Trainer-PIN stimmt nicht.'], 401);
    }
    account_ok('coaches', 'id', $id);
    session_regenerate_id(true);
    $_SESSION['coach'] = $id;
    json_out(['ok' => true, 'coach' => coach_state()]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
