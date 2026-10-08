<?php
/*
 * Alles für „Mein Bereich“ in einem Aufruf (nur angemeldeter Spieler)
 * GET → {ok, consent, profile, attendance:{total, attended, last:[{date, present}]},
 *        today:[{id, date, time, note, vor, nach}]}
 *        today = Trainings von heute (und gestern, für die Abfrage „nach dem Training“ bei späten Einheiten)
 */
require __DIR__ . '/config.php';
$u = require_user();

$st = db()->prepare('SELECT id, date, time, note FROM trainings WHERE date IN (?, ?) ORDER BY date DESC, time');
$st->execute([today(), date('Y-m-d', strtotime('-1 day'))]);
$today = [];
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
    $m = db()->prepare('SELECT phase, data FROM moods WHERE training_id = ? AND nr = ?');
    $m->execute([$t['id'], $u['nr']]);
    $e = ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'note' => $t['note'], 'vor' => null, 'nach' => null];
    foreach ($m->fetchAll(PDO::FETCH_ASSOC) as $r) $e[$r['phase']] = json_decode($r['data'], true);
    // gestrige Trainings nur zeigen, wenn noch die Abfrage „nachher“ offen ist
    if ($t['date'] !== today() && $e['nach'] !== null) continue;
    $today[] = $e;
}

json_out(['ok' => true, 'consent' => $u['consent'], 'profile' => (object)profile_of($u['nr']),
          'attendance' => attendance_summary($u['nr']), 'today' => $today]);
