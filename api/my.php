<?php
/*
 * Alles für „Mein Bereich“ in einem Aufruf (nur angemeldeter Spieler)
 * GET → {ok, consent, profile, attendance:{total, attended, last:[{date, present}]},
 *        today:[{id, date, time, note, vor, nach}]}
 *        upcoming:[{id, date, time, endTime, title, location, absent, canChange, deadline}]  (nächste Trainings, Absagen)
 *        games:[{id, date, time, title, location, status:"kader"|"out", reason}]  (ab 0.31.0: bekannt gegebene Kader der nächsten 3 Wochen, nur der eigene Status)
 *        today = Trainings von heute (und gestern, für die Abfrage „nach dem Training“ bei späten Einheiten)
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/calendar.php';
$u = require_user();
calendar_refresh();

// Barometer gibt es für Training, Spiel und Turnier – nicht für sonstige Termine (z. B. Elternabend)
$st = db()->prepare("SELECT id, date, time, note, title, kind, location FROM trainings WHERE date IN (?, ?) AND kind != 'termin' ORDER BY date DESC, time");
$st->execute([today(), date('Y-m-d', strtotime('-1 day'))]);
$today = [];
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
    $m = db()->prepare('SELECT phase, data FROM moods WHERE training_id = ? AND nr = ?');
    $m->execute([$t['id'], $u['nr']]);
    $e = ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'note' => $t['note'], 'title' => $t['title'] !== '' ? $t['title'] : 'Training',
          'kind' => $t['kind'], 'location' => $t['location'], 'vor' => null, 'nach' => null];
    foreach ($m->fetchAll(PDO::FETCH_ASSOC) as $r) $e[$r['phase']] = json_decode($r['data'], true);
    // gestrige Trainings nur zeigen, wenn noch die Abfrage „nachher“ offen ist
    if ($t['date'] !== today() && $e['nach'] !== null) continue;
    $today[] = $e;
}

// Kader: nur bekannt gegebene, nur eigener Status, Grund als Text, nie die Trainer-Notiz
require __DIR__ . '/lib/matchday.php';
$gs = db()->prepare("SELECT t.id, t.date, t.time, t.title, t.location, p.status, p.reason FROM trainings t JOIN match_calls c ON c.training_id = t.id AND c.announced = 1
                     LEFT JOIN match_call_players p ON p.training_id = t.id AND p.nr = ? WHERE t.date >= ? AND t.date <= ? ORDER BY t.date, t.time");
$gs->execute([$u['nr'], today(), date('Y-m-d', strtotime('+21 days'))]);
$games = array_map(fn($g) => ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel', 'location' => $g['location'],
                              'status' => $g['status'] === 'kader' ? 'kader' : 'out', 'reason' => $g['status'] === 'out' ? (KADER_REASONS[$g['reason']] ?? '') : ''], $gs->fetchAll(PDO::FETCH_ASSOC));

json_out(['ok' => true, 'consent' => $u['consent'], 'games' => $games, 'profile' => (object)profile_of($u['nr']),
          'attendance' => attendance_summary($u['nr']), 'today' => $today,
          'upcoming' => upcoming_for($u['nr']), 'reasons' => ABSENCE_REASONS]);
