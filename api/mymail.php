<?php
/*
 * Eigene E-Mail-Adresse für „Passwort vergessen“ (ab 0.34.0, nur Trainer/Admins, freiwillig)
 *   GET                                 → {ok, email, pending}
 *   POST {action:"set", email, password}   Adresse eintragen → Bestätigungs-Mail an die neue Adresse (Link 48 Std.)
 *   POST {action:"remove", password}       Adresse löschen
 * Das aktuelle Passwort wird jedes Mal abgefragt, damit niemand an einem offenen Gerät die Adresse umstellen kann.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/mail.php';
require_login();
$a = current_account();
if (!$a || $a['kind'] !== 'coach') json_out(['ok' => false, 'error' => 'Nur für Trainer- und Admin-Konten.'], 403);

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'email' => $a['email'], 'pending' => $a['email_new'], 'testmode' => mail_testmode()]);

require_method('POST');
$in = json_in();
if ($a['pw_hash'] === '' || !password_verify((string)($in['password'] ?? ''), $a['pw_hash'])) {
    account_fail('accounts', 'id', (int)$a['id']);
    sec_log('email_change_fail', 'warn', (int)$a['id'], $a['username'], 'Passwort falsch');
    json_out(['ok' => false, 'error' => 'Dein Passwort stimmt nicht.'], 400);
}
if (($in['action'] ?? '') === 'remove') {
    pdb()->prepare("UPDATE accounts SET email = '', email_new = '', email_token = '', email_token_exp = 0, reset_hash = '', reset_expires = 0 WHERE id = ?")->execute([$a['id']]);
    sec_log('email_removed', 'info', (int)$a['id'], $a['username'], 'E-Mail-Adresse gelöscht');
    json_out(['ok' => true, 'email' => '', 'pending' => '']);
}
if (($in['action'] ?? '') !== 'set') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
$email = trim(mb_substr((string)($in['email'] ?? ''), 0, 120));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['ok' => false, 'error' => 'Bitte eine gültige E-Mail-Adresse eingeben.'], 400);
$url = app_url();
if ($url === null) json_out(['ok' => false, 'error' => 'Die Adresse der App ist noch nicht eingestellt (Superadmin: Verwaltung → E-Mail-Versand).'], 400);
$t = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
pdb()->prepare('UPDATE accounts SET email_new = ?, email_token = ?, email_token_exp = ? WHERE id = ?')->execute([$email, hash('sha256', $t), time() + 48 * 3600, $a['id']]);
$r = send_mail($email, 'E-Mail-Adresse bestätigen – FU-STARS Lernzone',
    "Hallo,\n\nbitte bestätige diese E-Mail-Adresse für den Zugang „{$a['username']}“. Sie wird nur für „Passwort vergessen“ verwendet.\n\n"
    . "{$url}?verify=$t\n\n(Link gültig 48 Stunden.) Wenn du das nicht warst, ignoriere diese E-Mail.\n\nFU-STARS Lernzone");
if (str_starts_with($r, '!')) json_out(['ok' => false, 'error' => 'Die Bestätigungs-Mail konnte nicht verschickt werden: ' . substr($r, 1)], 502);
sec_log('email_set', 'info', (int)$a['id'], $a['username'], 'neue E-Mail-Adresse eingetragen, Bestätigung ' . ($r === 'outbox' ? 'im Testmodus abgelegt' : 'verschickt'));
json_out(['ok' => true, 'email' => $a['email'], 'pending' => $email, 'testmode' => $r === 'outbox']);
