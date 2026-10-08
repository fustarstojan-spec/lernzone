<?php
/*
 * Befindens-Barometer (Spieler)
 * POST {training, phase:"vor", data:{laune 1–5, schlaf 1–5, energie 1–5, nichtfit bool, kommentar}}
 * POST {training, phase:"nach", data:{rpe 1–10, kommentar}}
 * Nur für Trainings von heute oder gestern, erst nach Einwilligung der Eltern.
 */
require __DIR__ . '/config.php';
require_method('POST');
$u = require_user();
require_consent($u);

$in    = json_in();
$tid   = (int)($in['training'] ?? 0);
$phase = (string)($in['phase'] ?? '');
$d     = is_array($in['data'] ?? null) ? $in['data'] : [];

$st = db()->prepare('SELECT date FROM trainings WHERE id = ?');
$st->execute([$tid]);
$date = $st->fetchColumn();
if ($date === false) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);
if (!in_array($date, [today(), date('Y-m-d', strtotime('-1 day'))], true)) json_out(['ok' => false, 'error' => 'Für dieses Training ist die Abfrage geschlossen.'], 400);

if ($phase === 'vor') {
    $data = ['laune' => int_in($d['laune'] ?? null, 1, 5), 'schlaf' => int_in($d['schlaf'] ?? null, 1, 5),
             'energie' => int_in($d['energie'] ?? null, 1, 5), 'nichtfit' => !empty($d['nichtfit']),
             'kommentar' => clean_text($d['kommentar'] ?? '', 200)];
    if ($data['laune'] === null) json_out(['ok' => false, 'error' => 'Bitte wähle aus, wie du dich fühlst.'], 400);
} elseif ($phase === 'nach') {
    $data = ['rpe' => int_in($d['rpe'] ?? null, 1, 10), 'kommentar' => clean_text($d['kommentar'] ?? '', 200)];
    if ($data['rpe'] === null) json_out(['ok' => false, 'error' => 'Bitte wähle aus, wie anstrengend es war.'], 400);
} else {
    json_out(['ok' => false, 'error' => 'Unbekannte Abfrage.'], 400);
}

db()->prepare('INSERT INTO moods (training_id, nr, phase, data, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(training_id, nr, phase) DO UPDATE SET data = excluded.data, created_at = CURRENT_TIMESTAMP')
    ->execute([$tid, $u['nr'], $phase, json_encode($data, JSON_UNESCAPED_UNICODE)]);
json_out(['ok' => true, 'data' => $data]);
