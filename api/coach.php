<?php
/*
 * Trainer-Anmeldung
 * POST {action:"login",  pin}  → Trainer-PIN prüfen
 * POST {action:"setup",  pin}  → erste Trainer-PIN festlegen (nur wenn noch keine existiert
 *                                UND die Anfrage vom selben Rechner kommt, z. B. XAMPP)
 * POST {action:"logout"}       → Trainer abmelden
 * Antwort immer: {ok, coach:{active, hasPin, canSetup}} oder {ok:false, error}
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
    $state = coach_state();
    if (!$state['canSetup']) json_out(['ok' => false, 'error' => 'Die Trainer-PIN kann hier nicht festgelegt werden.'], 403);
    set_setting('coach_pin_hash', password_hash($pin, PASSWORD_DEFAULT));
    session_regenerate_id(true);
    $_SESSION['coach'] = true;
    json_out(['ok' => true, 'coach' => coach_state()]);
}

if ($action === 'login') {
    check_lock('coach');
    $hash = setting('coach_pin_hash');
    if ($hash === null || !password_verify($pin, $hash)) {
        count_fail('coach');
        json_out(['ok' => false, 'error' => 'Trainer-PIN stimmt nicht.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['coach'] = true;
    json_out(['ok' => true, 'coach' => coach_state()]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
