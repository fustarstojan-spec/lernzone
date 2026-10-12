<?php
/*
 * E-Mail-Versand einstellen (ab 0.34.0, nur Superadmin)
 *   GET  → {ok, host, port, secure, user, hasPass, from, fromName, appUrl, testmode}
 *   POST {action:"save", host, port, secure, user, pass ('' = unverändert), from, fromName, appUrl}
 *   POST {action:"test"}   Test-Mail an die eigene bestätigte Adresse
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/mail.php';
require_login();
$a = current_account();
if (!$a || empty($a['platform_admin'])) json_out(['ok' => false, 'error' => 'Nur für den Superadmin.'], 403);
$c = mail_cfg();
$out = fn() => json_out(['ok' => true, 'host' => $c['mail_host'] ?? '', 'port' => (int)($c['mail_port'] ?? 587), 'secure' => $c['mail_secure'] ?? 'tls',
    'user' => $c['mail_user'] ?? '', 'hasPass' => ($c['mail_pass'] ?? '') !== '', 'from' => $c['mail_from'] ?? '', 'fromName' => $c['mail_from_name'] ?? '',
    'appUrl' => $c['app_url'] ?? '', 'testmode' => mail_testmode(), 'myEmail' => $a['email']]);
if ($_SERVER['REQUEST_METHOD'] === 'GET') $out();
require_method('POST');
$in = json_in();
if (($in['action'] ?? '') === 'test') {
    if ($a['email'] === '') json_out(['ok' => false, 'error' => 'Erst unter „Mein Konto“ eine eigene E-Mail-Adresse eintragen und bestätigen.'], 400);
    $r = send_mail($a['email'], 'Test – FU-STARS Lernzone', "Hallo,\n\nder E-Mail-Versand der FU-STARS Lernzone funktioniert.\n");
    if (str_starts_with($r, '!')) json_out(['ok' => false, 'error' => substr($r, 1)], 502);
    json_out(['ok' => true, 'result' => $r]);
}
if (($in['action'] ?? '') !== 'save') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
$host = trim(mb_substr((string)($in['host'] ?? ''), 0, 120));
if ($host !== '' && !preg_match('/^[a-z0-9.-]+$/i', $host)) json_out(['ok' => false, 'error' => 'Ungültiger Mailserver.'], 400);
$app = trim(mb_substr((string)($in['appUrl'] ?? ''), 0, 200));
if ($app !== '' && !preg_match('#^https://[^\s<>"]+$#', $app)) json_out(['ok' => false, 'error' => 'Die Adresse der App muss mit https:// beginnen.'], 400);
$from = trim(mb_substr((string)($in['from'] ?? ''), 0, 120));
if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) json_out(['ok' => false, 'error' => 'Ungültige Absenderadresse.'], 400);
$vals = ['mail_host' => $host, 'mail_port' => (string)(int_in($in['port'] ?? 587, 1, 65535) ?? 587), 'mail_secure' => ($in['secure'] ?? '') === 'ssl' ? 'ssl' : 'tls',
         'mail_user' => clean_text($in['user'] ?? '', 120), 'mail_from' => $from, 'mail_from_name' => clean_text($in['fromName'] ?? '', 60), 'app_url' => $app];
if ((string)($in['pass'] ?? '') !== '') $vals['mail_pass'] = mail_secret_enc((string)$in['pass']);
mail_set($vals);
sec_log('mail_settings', 'warn', (int)$a['id'], $a['username'], 'E-Mail-Versand geändert' . ($host === '' ? ' (Testmodus)' : " ($host)"));
json_out(['ok' => true]);
