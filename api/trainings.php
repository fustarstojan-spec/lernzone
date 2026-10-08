<?php
/*
 * Trainings (nur Trainer)
 * GET          → [{id, date, time, endTime, title, kind, location, note, fromCalendar, present, vor, nach, avgLaune, avgRpe, alerts}]
 *                (alt → neu um heute herum: vergangene 30 Tage und kommende 14 Tage; Termine aus dem Google-Kalender automatisch)
 * GET ?id=5    → {training, state, present:[nr], absences:[{nr, reason, label}], coachesOut:[name], moods:[{nr, vor, nach}]}
 *                state: 0 = offen (present = erwartet: alle ohne Absage), 1 = erfasst, 2 = fällt aus
 * POST {action:"create", date, time, note}
 * POST {action:"delete", id}
 * POST {action:"attend", id, nr, present}     (bei offenem Training wird zuerst „alle ohne Absage = da“ festgeschrieben)
 * POST {action:"attendall", id, present}      present = alle ohne Absage da / false = niemand
 * POST {action:"cancel", id} / {action:"reopen", id}   Training fällt aus / findet doch statt
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/calendar.php';
require_coach();

$moodsOf = function (int $id): array {
    $st = db()->prepare('SELECT nr, phase, data FROM moods WHERE training_id = ? ORDER BY nr');
    $st->execute([$id]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $n = (int)$r['nr'];
        $out[$n] ??= ['nr' => $n, 'vor' => null, 'nach' => null];
        $out[$n][$r['phase']] = json_decode($r['data'], true);
    }
    return array_values($out);
};
$tOut = fn(array $t) => ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'endTime' => $t['end_time'] ?? '',
    'title' => ($t['title'] ?? '') !== '' ? $t['title'] : 'Training', 'kind' => $t['kind'] ?? 'training', 'location' => $t['location'] ?? '',
    'note' => $t['note'], 'fromCalendar' => ($t['cal_key'] ?? '') !== '', 'state' => (int)($t['att_done'] ?? 0), 'expected' => att_expected($t)];
$avg = function (array $vals): ?float { $vals = array_filter($vals, fn($v) => $v !== null); return $vals ? round(array_sum($vals) / count($vals), 1) : null; };

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $st = db()->prepare('SELECT * FROM trainings WHERE id = ?');
        $st->execute([$id]);
        $t = $st->fetch(PDO::FETCH_ASSOC);
        if (!$t) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);
        att_autofill();
        $st->execute([$id]); $t = $st->fetch(PDO::FETCH_ASSOC);
        $p = db()->prepare('SELECT nr FROM attendance WHERE training_id = ? ORDER BY nr');
        $p->execute([$id]);
        $present = att_expected($t) ? expected_players($id) : array_map('intval', $p->fetchAll(PDO::FETCH_COLUMN));
        $co = db()->prepare('SELECT c.name FROM coach_absences x JOIN coaches c ON c.id = x.coach_id WHERE x.training_id = ? ORDER BY c.name');
        $co->execute([$id]);
        $a = db()->prepare('SELECT nr, reason FROM absences WHERE training_id = ? ORDER BY nr');
        $a->execute([$id]);
        $abs = array_map(fn($r) => ['nr' => (int)$r['nr'], 'reason' => $r['reason'], 'label' => ABSENCE_REASONS[$r['reason']] ?? $r['reason']], $a->fetchAll(PDO::FETCH_ASSOC));
        json_out(['ok' => true, 'training' => $tOut($t),
                  'present' => $present, 'absences' => $abs, 'coachesOut' => $co->fetchAll(PDO::FETCH_COLUMN), 'moods' => $moodsOf($id)]);
    }
    calendar_refresh();
    att_autofill();
    $active = (int)db()->query('SELECT COUNT(*) FROM players WHERE active = 1')->fetchColumn();
    $st = db()->prepare('SELECT t.*, (SELECT COUNT(*) FROM attendance a WHERE a.training_id = t.id) AS present,
                                (SELECT COUNT(*) FROM absences b WHERE b.training_id = t.id) AS absent
                         FROM trainings t WHERE t.date >= ? AND t.date <= ? ORDER BY t.date DESC, t.time DESC LIMIT 120');
    $st->execute([date('Y-m-d', strtotime('-30 days')), date('Y-m-d', strtotime('+14 days'))]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(function ($t) use ($moodsOf, $avg, $tOut, $active) {
        if (att_expected($t)) $t['present'] = $active - (int)$t['absent'];   // erwartet
        $m = $moodsOf((int)$t['id']);
        $vor  = array_filter(array_map(fn($x) => $x['vor'], $m));
        $nach = array_filter(array_map(fn($x) => $x['nach'], $m));
        $alerts = count(array_filter($vor, fn($v) => !empty($v['nichtfit']) || ($v['laune'] ?? 5) <= 2));
        return $tOut($t) + [
                'present' => (int)$t['present'], 'absent' => (int)$t['absent'], 'vor' => count($vor), 'nach' => count($nach),
                'avgLaune' => $avg(array_map(fn($v) => $v['laune'] ?? null, $vor)),
                'avgRpe' => $avg(array_map(fn($v) => $v['rpe'] ?? null, $nach)), 'alerts' => $alerts];
    }, $rows));
}

require_method('POST');
$in     = json_in();
$action = (string)($in['action'] ?? '');

if ($action === 'create') {
    $date = (string)($in['date'] ?? '');
    $time = (string)($in['time'] ?? '');
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) json_out(['ok' => false, 'error' => 'Bitte ein gültiges Datum wählen.'], 400);
    if ($time !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) json_out(['ok' => false, 'error' => 'Bitte eine gültige Uhrzeit wählen.'], 400);
    db()->prepare('INSERT INTO trainings (date, time, note) VALUES (?, ?, ?)')->execute([$date, $time, clean_text($in['note'] ?? '', 80)]);
    json_out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

$id = (int)($in['id'] ?? 0);
$st = db()->prepare('SELECT COUNT(*) FROM trainings WHERE id = ?');
$st->execute([$id]);
if ((int)$st->fetchColumn() === 0) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);

if ($action === 'delete') {
    foreach (['attendance', 'moods', 'absences', 'coach_absences', 'grades'] as $t) db()->prepare("DELETE FROM $t WHERE training_id = ?")->execute([$id]);
    db()->prepare('DELETE FROM trainings WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

$presentOf = function (int $id): array {
    $p = db()->prepare('SELECT nr FROM attendance WHERE training_id = ? ORDER BY nr'); $p->execute([$id]);
    return array_map('intval', $p->fetchAll(PDO::FETCH_COLUMN));
};

if ($action === 'attendall') {                                 // alle ohne Absage „da“ bzw. niemand
    if (!empty($in['present'])) att_materialize($id);
    else { db()->prepare('DELETE FROM attendance WHERE training_id = ?')->execute([$id]); db()->prepare('UPDATE trainings SET att_done = 1 WHERE id = ?')->execute([$id]); }
    json_out(['ok' => true, 'present' => $presentOf($id), 'state' => 1]);
}

if ($action === 'cancel') {                                    // Training fällt aus: zählt nicht
    db()->prepare('DELETE FROM attendance WHERE training_id = ?')->execute([$id]);
    db()->prepare('UPDATE trainings SET att_done = 2 WHERE id = ?')->execute([$id]);
    json_out(['ok' => true, 'present' => [], 'state' => 2]);
}
if ($action === 'reopen') {                                    // findet doch statt
    db()->prepare('UPDATE trainings SET att_done = 0 WHERE id = ?')->execute([$id]);
    json_out(['ok' => true, 'present' => expected_players($id), 'state' => 0]);
}

if ($action === 'attend') {
    $state = (int)db()->query('SELECT att_done FROM trainings WHERE id = ' . $id)->fetchColumn();
    if ($state === 2) json_out(['ok' => false, 'error' => 'Dieses Training fällt aus. Erst „Findet doch statt“ wählen.'], 400);
    if ($state === 0) att_materialize($id);
    $nr = int_in($in['nr'] ?? null, 1, 99);
    if ($nr === null) json_out(['ok' => false, 'error' => 'Ungültige Nummer.'], 400);
    if (!empty($in['present'])) {                                // doch gekommen → Absage aufheben
        db()->prepare('INSERT OR IGNORE INTO attendance (training_id, nr) VALUES (?, ?)')->execute([$id, $nr]);
        db()->prepare('DELETE FROM absences WHERE training_id = ? AND nr = ?')->execute([$id, $nr]);
    }
    else db()->prepare('DELETE FROM attendance WHERE training_id = ? AND nr = ?')->execute([$id, $nr]);
    json_out(['ok' => true, 'present' => $presentOf($id), 'state' => 1]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
