<?php
/*
 * Trainer-Startseite (nur Trainer)
 * GET → {ok, me:{id, name}, coaches:[{id, name}],
 *        events:[{id, date, time, endTime, title, kind, location, state, players:{coming, recorded, total, absent}|null, coachesOut:[id]}],   die nächsten 4 Termine
 *        players:[{nr, plan, posOff, posDef, name, attended, total, pct, absences28}]}                                          Beteiligung aller Spieler
 * POST {action:"out", id} → ich kann bei diesem Termin nicht   ·   {action:"in", id} → ich bin doch dabei
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/calendar.php';
$me = require_coach();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_in();
    $id = (int)($in['id'] ?? 0);
    $st = db()->prepare('SELECT COUNT(*) FROM trainings WHERE id = ?'); $st->execute([$id]);
    if ((int)$st->fetchColumn() === 0) json_out(['ok' => false, 'error' => 'Diesen Termin gibt es nicht.'], 404);
    if (($in['action'] ?? '') === 'out') db()->prepare('INSERT OR IGNORE INTO coach_absences (training_id, coach_id) VALUES (?, ?)')->execute([$id, $me['id']]);
    elseif (($in['action'] ?? '') === 'in') db()->prepare('DELETE FROM coach_absences WHERE training_id = ? AND coach_id = ?')->execute([$id, $me['id']]);
    else json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
    json_out(['ok' => true]);
}

calendar_refresh();
att_autofill();
$st = pdb()->prepare("SELECT c.id, c.name FROM memberships m JOIN coaches c ON c.id = m.ref AND c.active = 1
                      WHERE m.team_id = ? AND m.role = 'coach' ORDER BY m.is_admin DESC, c.name");
$st->execute([team_id()]);
$coaches = $st->fetchAll(PDO::FETCH_ASSOC);
$total = (int)db()->query('SELECT COUNT(*) FROM players WHERE active = 1')->fetchColumn();

// Die nächsten 4 Termine (laufende von heute eingeschlossen)
$st = db()->prepare('SELECT t.*, (SELECT COUNT(*) FROM absences b WHERE b.training_id = t.id) AS absent,
                            (SELECT COUNT(*) FROM attendance a WHERE a.training_id = t.id) AS present
                     FROM trainings t WHERE t.date >= ? ORDER BY t.date, t.time LIMIT 12');
$st->execute([today()]);
$co = db()->prepare('SELECT coach_id FROM coach_absences WHERE training_id = ?');
$pl = db()->prepare('SELECT id, title FROM sessions WHERE training_id = ? ORDER BY id DESC LIMIT 1');   // Trainingsplan (ab 0.24.0)
$events = [];
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
    if (training_end($t) < time()) continue;
    $co->execute([$t['id']]);
    $isTr = $t['kind'] === 'training';
    $events[] = ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'endTime' => $t['end_time'],
        'title' => $t['title'] !== '' ? $t['title'] : 'Training', 'kind' => $t['kind'], 'location' => $t['location'],
        'state' => (int)$t['att_done'],
        'players' => $isTr ? ['coming' => match ((int)$t['att_done']) { 2 => 0, 1 => (int)$t['present'], default => $total - (int)$t['absent'] },
                              'recorded' => (int)$t['att_done'] === 1, 'total' => $total, 'absent' => (int)$t['absent']] : null,
        'coachesOut' => array_map('intval', $co->fetchAll(PDO::FETCH_COLUMN)),
        'plan' => $isTr ? (function () use ($pl, $t) { $pl->execute([$t['id']]); $p = $pl->fetch(PDO::FETCH_ASSOC); return $p ? ['id' => (int)$p['id'], 'title' => $p['title']] : null; })() : null];
    if (count($events) === 4) break;
}

// Beteiligung aller Spieler
$rows = db()->query('SELECT nr, pos, plan, pos_off, pos_def, consent FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
$ab = db()->prepare("SELECT COUNT(*) FROM absences b JOIN trainings t ON t.id = b.training_id WHERE b.nr = ? AND t.date >= ? AND t.date <= ?");
$players = array_map(function ($r) use ($ab) {
    $p = player_out($r);
    $prof = profile_of($p['nr']);
    $a = attendance_summary($p['nr']);
    $ab->execute([$p['nr'], date('Y-m-d', strtotime('-28 days')), date('Y-m-d', strtotime('+14 days'))]);
    return ['nr' => $p['nr'], 'plan' => $p['plan'], 'posOff' => $p['posOff'], 'posDef' => $p['posDef'],
            'name' => trim(($prof['vorname'] ?? '') . ' ' . ($prof['nachname'] ?? '')),
            'attended' => $a['attended'], 'total' => $a['total'], 'pct' => $a['total'] ? (int)round($a['attended'] / $a['total'] * 100) : null,
            'absences28' => (int)$ab->fetchColumn(), 'flag' => mood_flag($p['nr'])];
}, $rows);

json_out(['ok' => true, 'me' => ['id' => $me['id'], 'name' => $me['name']],
          'coaches' => array_map(fn($c) => ['id' => (int)$c['id'], 'name' => $c['name']], $coaches),
          'events' => $events, 'players' => $players]);
