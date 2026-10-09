<?php
/*
 * Sicherheit (ab 0.25.0): Bremse pro IP-Adresse beim Anmelden und Sicherheitsprotokoll.
 * IP-Adressen werden nie im Klartext gespeichert, nur als HMAC mit einem geheimen Schlüssel der Installation.
 */
const IP_MAX_FAILS = 20;          // Fehlversuche pro IP-Adresse …
const IP_WINDOW    = 15 * 60;     // … innerhalb von 15 Minuten
const IP_LOCK      = 15 * 60;     // → 15 Minuten keine Anmeldung von dieser Adresse
const SECLOG_DAYS  = 90;          // Protokoll wird nach 90 Tagen gelöscht

function ip_key(): string {
    static $key = null;
    if ($key !== null) return $key;
    $st = pdb()->query("SELECT value FROM platform_settings WHERE name = 'ip_secret'");
    $secret = (string)$st->fetchColumn();
    if ($secret === '') { $secret = bin2hex(random_bytes(32)); pdb()->prepare("INSERT OR IGNORE INTO platform_settings (name, value) VALUES ('ip_secret', ?)")->execute([$secret]); }
    return $key = substr(hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'cli'), $secret), 0, 16);
}

/* Ist diese IP-Adresse gerade gesperrt? */
function ip_blocked(): bool {
    $st = pdb()->prepare('SELECT locked_until FROM ip_guard WHERE ip = ?'); $st->execute([ip_key()]);
    return (int)$st->fetchColumn() > time();
}
/* Fehlversuch zählen; gibt true zurück, wenn die Adresse dadurch gesperrt wurde */
function ip_fail(): bool {
    $now = time(); $ip = ip_key();
    pdb()->prepare('DELETE FROM ip_guard WHERE window_start < ? AND locked_until < ?')->execute([$now - 86400, $now]);   // nach 24 Std. vergessen
    pdb()->prepare('INSERT INTO ip_guard (ip, fails, window_start) VALUES (?, 0, ?) ON CONFLICT(ip) DO NOTHING')->execute([$ip, $now]);
    pdb()->prepare('UPDATE ip_guard SET fails = CASE WHEN window_start < ? THEN 1 ELSE fails + 1 END,
                                        window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END WHERE ip = ?')
        ->execute([$now - IP_WINDOW, $now - IP_WINDOW, $now, $ip]);
    $st = pdb()->prepare('SELECT fails FROM ip_guard WHERE ip = ?'); $st->execute([$ip]);
    if ((int)$st->fetchColumn() < IP_MAX_FAILS) return false;
    pdb()->prepare('UPDATE ip_guard SET locked_until = ?, fails = 0, window_start = ? WHERE ip = ?')->execute([$now + IP_LOCK, $now, $ip]);
    return true;
}

/* Eintrag ins Sicherheitsprotokoll. level: info | warn | alert */
function sec_log(string $event, string $level = 'info', ?int $account = null, string $username = '', string $detail = ''): void {
    try {
        pdb()->prepare('INSERT INTO security_log (ts, event, level, account_id, username, actor_id, ip, team_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([time(), $event, $level, $account, mb_substr($username, 0, 40), !empty($_SESSION['acc']) ? (int)$_SESSION['acc'] : null,
                       ip_key(), team_id(), mb_substr($detail, 0, 200)]);
        if (random_int(1, 50) === 1) pdb()->prepare('DELETE FROM security_log WHERE ts < ?')->execute([time() - SECLOG_DAYS * 86400]);
    } catch (Throwable $e) { /* Protokoll darf die App nie blockieren */ }
}
/* Benutzername eines Kontos (für Protokoll-Einträge) */
function sec_user(?int $accountId): string {
    if (!$accountId) return '';
    $st = pdb()->prepare('SELECT username FROM accounts WHERE id = ?'); $st->execute([$accountId]);
    return (string)$st->fetchColumn();
}
