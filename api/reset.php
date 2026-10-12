<?php
/*
 * Passwort vergessen (ab 0.34.0) – ohne Anmeldung erreichbar, aber mit CSRF-Token der Sitzung.
 * Nur Trainer- und Admin-Konten mit bestätigter E-Mail bekommen einen Link; Spieler bekommen einen neuen Code vom Trainer.
 *   POST {action:"request", login}                   login = Benutzername oder E-Mail → immer dieselbe Antwort (verrät nicht, ob es das Konto gibt)
 *   POST {action:"check",   token}                   → {ok, valid, username, minLen}
 *   POST {action:"reset",   token, password, password2}  neues Passwort; alle Geräte abgemeldet; Info-Mail an das Konto
 *   POST {action:"verify",  token}                   E-Mail-Adresse bestätigen (Link aus der Bestätigungs-Mail)
 * Links gelten 30 Minuten (Passwort) bzw. 48 Stunden (Bestätigung), nur einmal. Gespeichert wird nur ein Hash des Links.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/mail.php';
require_method('POST');
const RESET_MINUTES = 30;
const RESET_GAP     = 600;      // höchstens ein Link pro Konto alle 10 Minuten

$in = json_in(); $action = (string)($in['action'] ?? '');
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m, 'csrf' => csrf_token()], $c);
$tok = fn() => preg_match('/^[A-Za-z0-9_-]{30,60}$/', (string)($in['token'] ?? '')) ? hash('sha256', (string)$in['token']) : '';
$byReset = function (string $h) {
    if ($h === '') return null;
    $st = pdb()->prepare("SELECT * FROM accounts WHERE reset_hash = ? AND reset_expires > ? AND active = 1 AND kind = 'coach'");
    $st->execute([$h, time()]); return $st->fetch(PDO::FETCH_ASSOC) ?: null;
};

if ($action === 'request') {
    if (ip_blocked()) $fail('Zu viele Versuche von diesem Netz. Bitte in 15 Minuten noch einmal.', 429);
    ip_fail();                                  // jede Anfrage zählt für die Bremse pro Netz (gegen Durchprobieren)
    $login = trim(mb_substr((string)($in['login'] ?? ''), 0, 120));
    $generic = ['ok' => true, 'testmode' => mail_testmode() && app_url() !== null && str_starts_with((string)app_url(), 'http://'), 'csrf' => csrf_token()];
    if ($login === '') $fail('Bitte Benutzername oder E-Mail eingeben.');
    $st = pdb()->prepare("SELECT * FROM accounts WHERE (username = ? COLLATE NOCASE OR (email != '' AND email = ? COLLATE NOCASE)) AND active = 1 LIMIT 1");
    $st->execute([$login, $login]); $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a || $a['kind'] !== 'coach' || $a['email'] === '') {
        sec_log('pw_reset_request', 'info', $a ? (int)$a['id'] : null, $a['username'] ?? mb_substr($login, 0, 30), $a ? 'kein Link: ' . ($a['kind'] !== 'coach' ? 'Spielerkonto' : 'keine E-Mail hinterlegt') : 'unbekannt');
        json_out($generic);
    }
    if (time() - (int)$a['reset_sent'] < RESET_GAP) json_out($generic);
    $url = app_url();
    if ($url === null) { sec_log('pw_reset_request', 'warn', (int)$a['id'], $a['username'], 'keine App-Adresse eingestellt'); json_out($generic); }
    $t = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    pdb()->prepare('UPDATE accounts SET reset_hash = ?, reset_expires = ?, reset_sent = ? WHERE id = ?')->execute([hash('sha256', $t), time() + RESET_MINUTES * 60, time(), $a['id']]);
    $r = send_mail($a['email'], 'Passwort zurücksetzen – FU-STARS Lernzone',
        "Hallo,\n\njemand (hoffentlich du) möchte das Passwort für den Zugang „{$a['username']}“ zurücksetzen.\n\n"
        . "Über diesen Link legst du ein neues Passwort fest (gültig " . RESET_MINUTES . " Minuten, nur einmal):\n{$url}?reset=$t\n\n"
        . "Wenn du das nicht warst, ignoriere diese E-Mail – dein Passwort bleibt unverändert.\n\nFU-STARS Lernzone");
    sec_log('pw_reset_request', str_starts_with($r, '!') ? 'warn' : 'info', (int)$a['id'], $a['username'], str_starts_with($r, '!') ? 'Versand fehlgeschlagen: ' . substr($r, 1) : ($r === 'outbox' ? 'Link erzeugt (Testmodus)' : 'Link verschickt'));
    json_out($generic);
}

if ($action === 'check') {
    $a = $byReset($tok());
    json_out(['ok' => true, 'valid' => (bool)$a, 'username' => $a['username'] ?? '', 'minLen' => pw_min('coach'), 'csrf' => csrf_token()]);
}

if ($action === 'reset') {
    if (ip_blocked()) $fail('Zu viele Versuche von diesem Netz. Bitte in 15 Minuten noch einmal.', 429);
    $a = $byReset($tok());
    if (!$a) { ip_fail(); $fail('Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an.'); }
    $pw = (string)($in['password'] ?? '');
    if ($pw !== (string)($in['password2'] ?? '')) $fail('Die beiden Passwörter sind nicht gleich.');
    if ($p = pw_problem($pw, $a['username'], 'coach')) $fail($p);
    pdb()->prepare("UPDATE accounts SET pw_hash = ?, must_set_pw = 0, code_hash = '', code_expires = 0, reset_hash = '', reset_expires = 0,
                    sess_ver = sess_ver + 1, fail_count = 0, locked_until = 0 WHERE id = ?")->execute([hash_pw($pw), $a['id']]);
    sec_log('pw_reset', 'warn', (int)$a['id'], $a['username'], 'Passwort über E-Mail-Link neu gesetzt, alle Geräte abgemeldet');
    send_mail($a['email'], 'Dein Passwort wurde geändert – FU-STARS Lernzone',
        "Hallo,\n\ndas Passwort für den Zugang „{$a['username']}“ wurde gerade über „Passwort vergessen“ neu festgelegt. Alle Geräte wurden abgemeldet.\n\n"
        . "Warst du das nicht? Dann melde dich sofort bei deinem Vereinsadmin.\n\nFU-STARS Lernzone");
    json_out(['ok' => true, 'username' => $a['username'], 'csrf' => csrf_token()]);
}

if ($action === 'verify') {
    $h = $tok(); if ($h === '') $fail('Ungültiger Link.');
    $st = pdb()->prepare("SELECT * FROM accounts WHERE email_token = ? AND email_token_exp > ? AND email_new != ''");
    $st->execute([$h, time()]); $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a) $fail('Der Bestätigungslink ist abgelaufen oder wurde schon benutzt.');
    $dup = pdb()->prepare("SELECT COUNT(*) FROM accounts WHERE id != ? AND email = ? COLLATE NOCASE"); $dup->execute([$a['id'], $a['email_new']]);
    if ((int)$dup->fetchColumn()) $fail('Diese E-Mail-Adresse ist inzwischen bei einem anderen Zugang hinterlegt.');
    pdb()->prepare("UPDATE accounts SET email = email_new, email_new = '', email_token = '', email_token_exp = 0 WHERE id = ?")->execute([$a['id']]);
    sec_log('email_verified', 'info', (int)$a['id'], $a['username'], 'E-Mail-Adresse bestätigt');
    json_out(['ok' => true, 'csrf' => csrf_token()]);
}
$fail('Unbekannte Aktion');
