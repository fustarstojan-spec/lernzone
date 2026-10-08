<?php
/*
 * Trainer-Bewertung nach dem Training – Schulnoten 1 (sehr gut) bis 6 (ungenügend), jeder Trainer einzeln, nur für Trainer
 * GET ?training=5  → {ok, mine:{nr:{area:note}}, others:{nr:{area:Ø}}, count:{nr: Anzahl anderer Trainer}}
 * GET ?nr=7        → {ok, avg4:{area:Ø}, season:{area:Ø}, list:[{date, title, values:{area:Ø}, coaches}]}   (Ø über alle Trainer)
 * POST {action:"set", id, nr, area, value}   value 1–6 oder null (löschen)
 * Bereiche: verhalten · umsetzung · einstellung · soziales
 */
require __DIR__ . '/config.php';
$me = require_coach();
const GRADE_AREAS = ['verhalten', 'umsetzung', 'einstellung', 'soziales'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['training'])) {
        $st = db()->prepare('SELECT nr, coach_id, area, value FROM grades WHERE training_id = ?'); $st->execute([(int)$_GET['training']]);
        $mine = []; $sum = []; $who = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $g) {
            $nr = (int)$g['nr'];
            if ((int)$g['coach_id'] === $me['id']) { $mine[$nr][$g['area']] = (int)$g['value']; continue; }
            $sum[$nr][$g['area']][] = (int)$g['value']; $who[$nr][(int)$g['coach_id']] = 1;
        }
        $others = array_map(fn($a) => array_map(fn($v) => round(array_sum($v) / count($v), 1), $a), $sum);
        json_out(['ok' => true, 'mine' => (object)$mine, 'others' => (object)$others, 'count' => (object)array_map('count', $who)]);
    }
    $nr = (int)($_GET['nr'] ?? 0);
    $season = (string)(db()->query("SELECT value FROM settings WHERE name = 'season_start'")->fetchColumn() ?: '2000-01-01');
    $st = db()->prepare('SELECT g.training_id, t.date, t.title, g.area, g.value, g.coach_id FROM grades g JOIN trainings t ON t.id = g.training_id
                         WHERE g.nr = ? AND t.date >= ? ORDER BY t.date DESC, t.time DESC');
    $st->execute([$nr, $season]);
    $by = []; $s4 = []; $ss = []; $from4 = date('Y-m-d', strtotime('-28 days'));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $g) {
        $k = (int)$g['training_id'];
        $by[$k] ??= ['date' => $g['date'], 'title' => $g['title'] ?: 'Training', 'vals' => [], 'coaches' => []];
        $by[$k]['vals'][$g['area']][] = (int)$g['value']; $by[$k]['coaches'][(int)$g['coach_id']] = 1;
        $ss[$g['area']][] = (int)$g['value']; if ($g['date'] >= $from4) $s4[$g['area']][] = (int)$g['value'];
    }
    $avg = fn($a) => (object)array_map(fn($v) => round(array_sum($v) / count($v), 1), $a);
    json_out(['ok' => true, 'avg4' => $avg($s4), 'season' => $avg($ss),
              'list' => array_values(array_map(fn($x) => ['date' => $x['date'], 'title' => $x['title'], 'values' => $avg($x['vals']), 'coaches' => count($x['coaches'])], $by))]);
}

require_method('POST');
$in = json_in();
if (($in['action'] ?? '') !== 'set') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
$id = (int)($in['id'] ?? 0);
$st = db()->prepare("SELECT COUNT(*) FROM trainings WHERE id = ? AND kind = 'training'"); $st->execute([$id]);
if ((int)$st->fetchColumn() === 0) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);
$nr = int_in($in['nr'] ?? null, 1, 99); $area = (string)($in['area'] ?? '');
if ($nr === null || !in_array($area, GRADE_AREAS, true)) json_out(['ok' => false, 'error' => 'Ungültige Eingabe.'], 400);
if (($in['value'] ?? null) === null || $in['value'] === '') {
    db()->prepare('DELETE FROM grades WHERE training_id = ? AND nr = ? AND coach_id = ? AND area = ?')->execute([$id, $nr, $me['id'], $area]);
} else {
    $v = int_in($in['value'], 1, 6);
    if ($v === null) json_out(['ok' => false, 'error' => 'Note 1 bis 6.'], 400);
    db()->prepare('INSERT INTO grades (training_id, nr, coach_id, area, value) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(training_id, nr, coach_id, area) DO UPDATE SET value = excluded.value, created_at = CURRENT_TIMESTAMP')
        ->execute([$id, $nr, $me['id'], $area, $v]);
}
json_out(['ok' => true]);
