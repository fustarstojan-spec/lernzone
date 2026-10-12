<?php
/*
 * E-Mail-Versand (ab 0.34.0) – nur für „Passwort vergessen“ und E-Mail-Bestätigung von Trainern und Admins.
 * Einstellungen (Superadmin, Verwaltung → E-Mail-Versand) in platform_settings:
 *   mail_host, mail_port, mail_secure (tls = STARTTLS / ssl), mail_user, mail_pass (verschlüsselt), mail_from, mail_from_name, app_url
 * Ohne mail_host: Testmodus – die Nachricht wird als .eml-Datei in storage/mail-outbox/ abgelegt (nicht ins Repository, von außen gesperrt).
 * Eigener kleiner SMTP-Client (keine Bibliotheken): EHLO, STARTTLS oder SSL, AUTH LOGIN, MAIL/RCPT/DATA.
 */

function mail_cfg(): array {
    static $c = null;
    if ($c !== null) return $c;
    $c = [];
    foreach (pdb()->query("SELECT name, value FROM platform_settings WHERE name LIKE 'mail\\_%' ESCAPE '\\' OR name = 'app_url'")->fetchAll(PDO::FETCH_ASSOC) as $r) $c[$r['name']] = $r['value'];
    return $c;
}
function mail_set(array $vals): void {
    $st = pdb()->prepare('INSERT INTO platform_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value');
    foreach ($vals as $k => $v) $st->execute([$k, (string)$v]);
}

/* Passwort des Mailkontos verschlüsselt ablegen (Schlüssel bleibt in der Datenbank-Datei, aber nicht im Klartext neben dem Passwort) */
function mail_key(): string {
    $st = pdb()->query("SELECT value FROM platform_settings WHERE name = 'mail_key'");
    $k = (string)$st->fetchColumn();
    if ($k === '') { $k = bin2hex(random_bytes(32)); pdb()->prepare("INSERT OR IGNORE INTO platform_settings (name, value) VALUES ('mail_key', ?)")->execute([$k]); }
    return hex2bin($k);
}
function mail_secret_enc(string $plain): string {
    if ($plain === '' || !function_exists('openssl_encrypt')) return $plain === '' ? '' : 'plain:' . base64_encode($plain);
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'gcm:' . base64_encode($iv . $tag . $ct);
}
function mail_secret_dec(string $v): string {
    if (str_starts_with($v, 'plain:')) return (string)base64_decode(substr($v, 6));
    if (!str_starts_with($v, 'gcm:') || !function_exists('openssl_decrypt')) return '';
    $b = (string)base64_decode(substr($v, 4));
    return (string)openssl_decrypt(substr($b, 28), 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
}

/* Adresse der App für Links in E-Mails. Nie aus dem Host-Header des Besuchers (sonst könnten Angreifer Links umlenken) –
   außer lokal (localhost), damit es in XAMPP ohne Einstellung funktioniert. */
function app_url(): ?string {
    $u = trim((string)(mail_cfg()['app_url'] ?? ''));
    if ($u !== '') return rtrim($u, '/') . '/';
    $host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    if (!in_array($host, ['localhost', '127.0.0.1', '[::1]'], true)) return null;
    $dir = rtrim(str_replace('\\', '/', dirname(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/x.php')))), '/');
    return 'http://' . $_SERVER['HTTP_HOST'] . $dir . '/';
}
function mail_testmode(): bool { return trim((string)(mail_cfg()['mail_host'] ?? '')) === ''; }

/* Nachricht senden. Rückgabe: 'sent' | 'outbox' (Testmodus) | Fehlertext mit vorangestelltem '!' */
function send_mail(string $to, string $subject, string $text): string {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return '!Ungültige Empfängeradresse.';
    $c = mail_cfg();
    $from = trim((string)($c['mail_from'] ?? '')) ?: 'noreply@localhost';
    $name = trim((string)($c['mail_from_name'] ?? '')) ?: 'FU-STARS Lernzone';
    $enc = fn($s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
    $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
    $headers = ['Date: ' . date('r'), 'From: ' . $enc($name) . " <$from>", "To: <$to>", 'Subject: ' . $enc($subject),
                'Message-ID: <' . bin2hex(random_bytes(12)) . "@$domain>", 'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', 'Auto-Submitted: auto-generated'];
    $msg = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($text), 76, "\r\n");
    if (mail_testmode()) {
        $dir = STORAGE_DIR . '/mail-outbox';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        file_put_contents($dir . '/' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.eml', $msg);
        return 'outbox';
    }
    return smtp_send($c, $from, $to, $msg);
}

function smtp_send(array $c, string $from, string $to, string $msg): string {
    $host = trim((string)$c['mail_host']); $port = (int)($c['mail_port'] ?? 587) ?: 587;
    $secure = ($c['mail_secure'] ?? 'tls') === 'ssl' ? 'ssl' : 'tls';
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) return "!Mailserver nicht erreichbar ($errstr).";
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): array { $all = ''; while (($l = fgets($fp, 1024)) !== false) { $all .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return [(int)substr($all, 0, 3), trim($all)]; };
    $cmd = function (string $line, array $okCodes) use ($fp, $read): ?string { if ($line !== '') fwrite($fp, $line . "\r\n"); [$code, $t] = $read(); return in_array($code, $okCodes, true) ? null : $t; };
    $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
    $fail = function (string $step, string $t) use ($fp): string { @fwrite($fp, "QUIT\r\n"); fclose($fp); return "!Mailserver ($step): " . mb_substr($t, 0, 160); };
    if ($e = $cmd('', [220])) return $fail('Begrüßung', $e);
    if ($e = $cmd($ehlo, [250])) return $fail('EHLO', $e);
    if ($secure === 'tls') {
        if ($e = $cmd('STARTTLS', [220])) return $fail('STARTTLS', $e);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) return $fail('TLS', 'Verschlüsselung fehlgeschlagen');
        if ($e = $cmd($ehlo, [250])) return $fail('EHLO', $e);
    }
    $user = (string)($c['mail_user'] ?? '');
    if ($user !== '') {
        if ($e = $cmd('AUTH LOGIN', [334])) return $fail('AUTH', $e);
        if ($e = $cmd(base64_encode($user), [334])) return $fail('Benutzer', $e);
        if ($e = $cmd(base64_encode(mail_secret_dec((string)($c['mail_pass'] ?? ''))), [235])) return $fail('Passwort', $e);
    }
    if ($e = $cmd("MAIL FROM:<$from>", [250])) return $fail('Absender', $e);
    if ($e = $cmd("RCPT TO:<$to>", [250, 251])) return $fail('Empfänger', $e);
    if ($e = $cmd('DATA', [354])) return $fail('DATA', $e);
    $body = preg_replace('/^\./m', '..', $msg);
    if ($e = $cmd($body . "\r\n.", [250])) return $fail('Senden', $e);
    @fwrite($fp, "QUIT\r\n"); fclose($fp);
    return 'sent';
}
