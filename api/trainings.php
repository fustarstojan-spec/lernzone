<?php
/*
 * Trainings (nur Trainer)
 * GET          → [{id, date, time, note, present, vor, nach, avgLaune, avgRpe, alerts}]  (neu → alt, max. 60)
 * GET ?id=5    → {training, present:[nr], moods:[{nr, vor, nach}]}
 * POST {action:"create", date, time, note}
 * POST {action:"delete", id}
 * POST {action:"attend", id, nr, present}
 */
require __DIR__ . '/config.php';
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
$avg = function (array $vals): ?float { $vals = array_filter($vals, fn($v) => $v !== null); return $vals ? round(array_sum($vals) / count($vals), 1) : null; };

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $st = db()->prepare('SELECT id, date, time, note FROM trainings WHERE id = ?');
        $st->execute([$id]);
        $t = $st->fetch(PDO::FETCH_ASSOC);
        if (!$t) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);
        $p = db()->prepare('SELECT nr FROM attendance WHERE training_id = ? ORDER BY nr');
        $p->execute([$id]);
        json_out(['ok' => true, 'training' => ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'note' => $t['note']],
                  'present' => array_map('intval', $p->fetchAll(PDO::FETCH_COLUMN)), 'moods' => $moodsOf($id)]);
    }
    $rows = db()->query('SELECT t.id, t.date, t.time, t.note, (SELECT COUNT(*) FROM attendance a WHERE a.training_id = t.id) AS present
                         FROM trainings t ORDER BY t.date DESC, t.time DESC LIMIT 60')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(function ($t) use ($moodsOf, $avg) {
        $m = $moodsOf((int)$t['id']);
        $vor  = array_filter(array_map(fn($x) => $x['vor'], $m));
        $nach = array_filter(array_map(fn($x) => $x['nach'], $m));
        $alerts = count(array_filter($vor, fn($v) => !empty($v['nichtfit']) || ($v['laune'] ?? 5) <= 2));
        return ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'note' => $t['note'],
                'present' => (int)$t['present'], 'vor' => count($vor), 'nach' => count($nach),
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
    foreach (['attendance', 'moods'] as $t) db()->prepare("DELETE FROM $t WHERE training_id = ?")->execute([$id]);
    db()->prepare('DELETE FROM trainings WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

if ($action === 'attend') {
    $nr = int_in($in['nr'] ?? null, 1, 99);
    if ($nr === null) json_out(['ok' => false, 'error' => 'Ungültige Nummer.'], 400);
    if (!empty($in['present'])) db()->prepare('INSERT OR IGNORE INTO attendance (training_id, nr) VALUES (?, ?)')->execute([$id, $nr]);
    else db()->prepare('DELETE FROM attendance WHERE training_id = ? AND nr = ?')->execute([$id, $nr]);
    json_out(['ok' => true]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
