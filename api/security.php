<?php
/*
 * Sicherheitsprotokoll ansehen (ab 0.25.0)
 * Superadmin: alles. Vereinsadmin: Einträge zu Konten seines Vereins (Trainer, Spieler, Vereinsadmins) und von ihnen ausgelöste.
 * GET ?only=warn → nur Warnungen und Alarme. → {ok, stats:{fails, locks, blocked, night}, events:[{ts, event, level, username, actor, team, detail, ip}]}
 */
require __DIR__ . '/config.php';
require_login();
$acc = current_account();
$super = !empty($acc['platform_admin']);
$clubs = $acc['kind'] === 'coach' ? array_column(array_filter(admin_clubs($acc), fn($c) => $c['own']), 'id') : [];
if (!$super && !$clubs) json_out(['ok' => false, 'error' => 'Nur für Vereins- und Superadmins.'], 403);

$where = '1 = 1'; $args = [];
if (!$super) {
    $in = implode(',', array_map('intval', $clubs));
    $members = "SELECT m.account_id FROM memberships m JOIN teams t ON t.id = m.team_id WHERE t.club_id IN ($in)
                UNION SELECT account_id FROM club_admins WHERE club_id IN ($in)";
    $where = "(l.account_id IN ($members) OR l.actor_id IN ($members) OR l.team_id IN (SELECT id FROM teams WHERE club_id IN ($in)))";
}
if (($_GET['only'] ?? '') === 'warn') $where .= " AND l.level IN ('warn', 'alert')";
$since = time() - 86400;
$st = pdb()->prepare("SELECT l.*, a.username AS actor FROM security_log l LEFT JOIN accounts a ON a.id = l.actor_id WHERE $where ORDER BY l.id DESC LIMIT 200");
$st->execute($args);
$events = array_map(fn($r) => ['ts' => (int)$r['ts'], 'event' => $r['event'], 'level' => $r['level'], 'username' => $r['username'],
    'actor' => (string)$r['actor'], 'team' => $r['team_id'] ? (int)$r['team_id'] : null, 'detail' => $r['detail'], 'ip' => $r['ip']], $st->fetchAll(PDO::FETCH_ASSOC));
$count = function (string $cond) use ($where, $since): int {
    $st = pdb()->prepare("SELECT COUNT(*) FROM security_log l WHERE $where AND l.ts >= ? AND $cond"); $st->execute([$since]);
    return (int)$st->fetchColumn();
};
json_out(['ok' => true, 'super' => $super, 'stats' => [
    'fails'   => $count("l.event = 'login_fail'"),
    'locks'   => $count("l.event = 'account_locked'"),
    'blocked' => $count("l.event = 'ip_blocked'"),
    'night'   => $count("l.event IN ('login_ok', 'login_code') AND l.level = 'warn'"),
], 'events' => $events]);
