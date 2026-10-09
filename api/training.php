<?php
/*
 * Trainingsplanung (ab 0.24.0, nur Trainer)
 * Übungen gehören dem Verein (Plattform-DB, Tabelle drills), Einheiten der Mannschaft (Tabelle sessions, je Termin).
 *
 * GET                 → {ok, sessions:[{id, trainingId, date, title, focus, minutes}], trainings:[{id, date, time, title, session}]}
 * GET ?drills=1       → {ok, drills:[{…alle Felder}]}
 * GET ?session=5      → {ok, session:{…, blocks}, drills:{id: {…}}}
 * GET ?training=7     → wie ?session, für den Plan dieses Termins (session null, wenn keiner)
 * POST {action:"drill_save", id?, image?(Daten-URL), imageClear?, title, topic, phase, block, minutes, players, organisation, ablauf, coaching, easier, harder, load, material, sketch|boardId, draft}
 * POST {action:"drill_delete", id}
 * POST {action:"session_save", id?, trainingId, date, title, focus, phase, goal, players, notes, blocks}
 * POST {action:"session_delete", id}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/lib/board.php';
require_once __DIR__ . '/lib/drill_image.php';
$me   = require_coach();
$club = (int)team_info()['clubId'];

const BLOCKS = ['einstimmung', 'uebung', 'spiel', 'ausklang'];
const DRILL_TEXT = ['players' => 200, 'organisation' => 3000, 'ablauf' => 4000, 'coaching' => 3000, 'easier' => 1500, 'harder' => 1500, 'load' => 600, 'material' => 300];

$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
$phase = fn($v) => in_array((string)$v, ['1', '2', '3', '4', '5'], true) ? (string)$v : '';
/* mehrzeiliger Text: Zeilen säubern, Aufzählungszeichen am Anfang entfernen, leere Zeilen weg */
$lines = function ($v, int $max): string {
    $out = [];
    foreach (preg_split('/\r?\n/', (string)$v) as $l) {
        $l = trim(preg_replace('/^\s*([-–•*·]|\d+[.)])\s+/u', '', clean_text($l, 400)) ?? '');
        if ($l !== '') $out[] = $l;
    }
    return mb_substr(implode("\n", $out), 0, $max);
};
$drillOut = fn(array $d) => ['id' => (int)$d['id'], 'title' => $d['title'], 'topic' => $d['topic'], 'phase' => $d['phase'], 'block' => $d['block'],
    'minutes' => (int)$d['minutes'], 'players' => $d['players'], 'organisation' => $d['organisation'], 'ablauf' => $d['ablauf'], 'coaching' => $d['coaching'],
    'easier' => $d['easier'], 'harder' => $d['harder'], 'load' => $d['load'], 'material' => $d['material'],
    'sketch' => $d['sketch'] !== '' ? json_decode($d['sketch'], true) : null,
    'image' => ($d['image'] ?? '') !== '' ? 'api/drill_image.php?id=' . (int)$d['id'] . '&v=' . substr(md5($d['image']), 0, 8) : null, 'draft' => (bool)$d['draft'], 'updated' => $d['updated_at'], 'by' => (string)($d['by_name'] ?? '')];
$drills = function (?array $ids = null) use ($club, $drillOut): array {
    $sql = 'SELECT d.*, c.name AS by_name FROM drills d LEFT JOIN coaches c ON c.id = d.updated_by WHERE d.club_id = ?';
    $args = [$club];
    if ($ids !== null) { if (!$ids) return []; $sql .= ' AND d.id IN (' . implode(',', array_map('intval', $ids)) . ')'; }
    else $sql .= ' AND d.active = 1';
    $st = pdb()->prepare($sql . ' ORDER BY d.title'); $st->execute($args);
    return array_map($drillOut, $st->fetchAll(PDO::FETCH_ASSOC));
};
$sessionOut = function (array $s): array {
    $d = json_decode($s['data'], true) ?: [];
    $blocks = [];
    foreach (BLOCKS as $b) $blocks[$b] = array_values(array_map(fn($i) => ['drill' => (int)($i['drill'] ?? 0) ?: null, 'min' => (int)($i['min'] ?? 0), 'note' => (string)($i['note'] ?? '')],
                                                                 is_array($d['blocks'][$b] ?? null) ? $d['blocks'][$b] : []));
    return ['id' => (int)$s['id'], 'trainingId' => $s['training_id'] ? (int)$s['training_id'] : null, 'date' => $s['date'], 'title' => $s['title'],
        'focus' => $s['focus'], 'phase' => $s['phase'], 'goal' => $s['goal'], 'players' => $s['players'], 'notes' => $s['notes'], 'blocks' => $blocks,
        'minutes' => array_sum(array_map(fn($b) => array_sum(array_column($b, 'min')), $blocks)), 'updated' => $s['updated_at']];
};
$sessionFull = function (?array $row) use ($sessionOut, $drills): array {
    if (!$row) return ['ok' => true, 'session' => null, 'drills' => (object)[]];
    $s = $sessionOut($row);
    $ids = [];
    foreach ($s['blocks'] as $b) foreach ($b as $i) if ($i['drill']) $ids[] = $i['drill'];
    return ['ok' => true, 'session' => $s, 'drills' => (object)array_column($drills(array_unique($ids)), null, 'id')];
};
$training = function (int $id): ?array {
    $st = db()->prepare('SELECT id, date, time, end_time, title, kind FROM trainings WHERE id = ?'); $st->execute([$id]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['drills'])) json_out(['ok' => true, 'drills' => $drills()]);
    if (isset($_GET['session'])) {
        $st = db()->prepare('SELECT * FROM sessions WHERE id = ?'); $st->execute([(int)$_GET['session']]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: $fail('Diese Einheit gibt es nicht.', 404);
        json_out($sessionFull($row) + ['training' => $row['training_id'] ? $training((int)$row['training_id']) : null]);
    }
    if (isset($_GET['training'])) {
        $st = db()->prepare('SELECT * FROM sessions WHERE training_id = ? ORDER BY id DESC LIMIT 1'); $st->execute([(int)$_GET['training']]);
        json_out($sessionFull($st->fetch(PDO::FETCH_ASSOC) ?: null) + ['training' => $training((int)$_GET['training'])]);
    }
    $sessions = array_map($sessionOut, db()->query('SELECT * FROM sessions ORDER BY date DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC));
    $byTraining = [];
    foreach ($sessions as $s) if ($s['trainingId']) $byTraining[$s['trainingId']] ??= $s['id'];
    $st = db()->prepare("SELECT id, date, time, end_time, title FROM trainings WHERE kind = 'training' AND date >= ? AND date <= ? ORDER BY date, time");
    $st->execute([date('Y-m-d', strtotime('-21 days')), date('Y-m-d', strtotime('+21 days'))]);
    json_out(['ok' => true,
        'sessions' => array_map(fn($s) => ['id' => $s['id'], 'trainingId' => $s['trainingId'], 'date' => $s['date'], 'title' => $s['title'], 'focus' => $s['focus'], 'minutes' => $s['minutes']], $sessions),
        'trainings' => array_map(fn($t) => ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'endTime' => $t['end_time'], 'title' => $t['title'] ?: 'Training',
                                            'session' => $byTraining[(int)$t['id']] ?? null], $st->fetchAll(PDO::FETCH_ASSOC))]);
}

require_method('POST');
$in = json_in();
$now = date('Y-m-d H:i');

switch ($in['action'] ?? '') {
    case 'drill_save':
        $title = clean_text($in['title'] ?? '', 80);
        if ($title === '') $fail('Bitte einen Namen für die Übung eingeben.');
        $block = in_array($in['block'] ?? '', BLOCKS, true) ? $in['block'] : 'uebung';
        $vals = ['title' => $title, 'topic' => clean_text($in['topic'] ?? '', 40), 'phase' => $phase($in['phase'] ?? ''), 'block' => $block,
                 'minutes' => int_in($in['minutes'] ?? 0, 0, 120) ?? 0, 'draft' => !empty($in['draft']) ? 1 : 0];
        foreach (DRILL_TEXT as $k => $max) $vals[$k] = $lines($in[$k] ?? '', $max);
        $vals['players'] = clean_text($in['players'] ?? '', 200);
        $vals['material'] = clean_text($in['material'] ?? '', 300);
        // Skizze: aus einer Taktiktafel der Mannschaft übernehmen, behalten oder entfernen
        if (!empty($in['boardId'])) {
            $st = db()->prepare('SELECT data FROM boards WHERE id = ?'); $st->execute([(int)$in['boardId']]);
            $b = $st->fetchColumn(); if ($b === false) $fail('Diese Taktiktafel gibt es nicht.', 404);
            $vals['sketch'] = json_encode(board_clean(json_decode($b, true) ?: []));
        } elseif (array_key_exists('sketch', $in)) $vals['sketch'] = is_array($in['sketch']) ? json_encode(board_clean($in['sketch'])) : '';
        $id = (int)($in['id'] ?? 0);
        if ($id) {
            $st = pdb()->prepare('SELECT COUNT(*) FROM drills WHERE id = ? AND club_id = ?'); $st->execute([$id, $club]);
            if (!(int)$st->fetchColumn()) $fail('Diese Übung gibt es nicht.', 404);
            $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($vals)));
            pdb()->prepare("UPDATE drills SET $set, updated_by = :by, updated_at = :at WHERE id = :id")->execute($vals + ['by' => $me['id'], 'at' => $now, 'id' => $id]);
        } else {
            $cols = implode(', ', array_keys($vals)); $ph = ':' . implode(', :', array_keys($vals));
            pdb()->prepare("INSERT INTO drills (club_id, $cols, created_by, updated_by, updated_at) VALUES (:club, $ph, :by, :by, :at)")->execute($vals + ['club' => $club, 'by' => $me['id'], 'at' => $now]);
            $id = (int)pdb()->lastInsertId();
        }
        // Bild: neu hochladen (Daten-URL) oder entfernen
        if (!empty($in['image']) || !empty($in['imageClear'])) {
            $st = pdb()->prepare('SELECT image FROM drills WHERE id = ?'); $st->execute([$id]); $old = (string)$st->fetchColumn();
            $new = '';
            if (!empty($in['image'])) $new = drill_image_store($club, $id, (string)$in['image']);
            if (str_starts_with($new, '!')) $warn = substr($new, 1) . ' Die Übung selbst ist gespeichert.';
            else { pdb()->prepare('UPDATE drills SET image = ? WHERE id = ?')->execute([$new, $id]); drill_image_delete($old); }
        }
        json_out(['ok' => true, 'drill' => $drills([$id])[0], 'warning' => $warn ?? null]);

    case 'drill_delete':
        // Nur ausblenden: Einheiten, die die Übung nutzen, zeigen sie weiter an
        pdb()->prepare('UPDATE drills SET active = 0, updated_by = ?, updated_at = ? WHERE id = ? AND club_id = ?')->execute([$me['id'], $now, (int)($in['id'] ?? 0), $club]);
        json_out(['ok' => true]);

    case 'session_save':
        $tid = (int)($in['trainingId'] ?? 0) ?: null;
        $t = $tid ? ($training($tid) ?: $fail('Diesen Termin gibt es nicht.', 404)) : null;
        $date = $t ? $t['date'] : (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['date'] ?? '')) ? $in['date'] : '');
        $title = clean_text($in['title'] ?? '', 80);
        if ($title === '') $fail('Bitte einen Titel eingeben, z. B. „2v1 – Koordination“.');
        $valid = array_column($drills(null), 'id');
        $blocks = [];
        foreach (BLOCKS as $b) {
            $blocks[$b] = [];
            foreach (array_slice(is_array($in['blocks'][$b] ?? null) ? $in['blocks'][$b] : [], 0, 12) as $i) {
                $d = (int)($i['drill'] ?? 0); $note = clean_text($i['note'] ?? '', 300);
                if ($d && !in_array($d, $valid, true)) { $st = pdb()->prepare('SELECT COUNT(*) FROM drills WHERE id = ? AND club_id = ?'); $st->execute([$d, $club]); if (!(int)$st->fetchColumn()) $d = 0; }
                if (!$d && $note === '') continue;
                $blocks[$b][] = ['drill' => $d ?: null, 'min' => int_in($i['min'] ?? 0, 0, 120) ?? 0, 'note' => $note];
            }
        }
        $vals = ['training_id' => $tid, 'date' => $date, 'title' => $title, 'focus' => clean_text($in['focus'] ?? '', 60), 'phase' => $phase($in['phase'] ?? ''),
                 'goal' => clean_text($in['goal'] ?? '', 300), 'players' => clean_text($in['players'] ?? '', 100), 'notes' => $lines($in['notes'] ?? '', 2000),
                 'data' => json_encode(['blocks' => $blocks], JSON_UNESCAPED_UNICODE)];
        $id = (int)($in['id'] ?? 0);
        if ($tid) {   // ein Plan pro Termin
            $st = db()->prepare('SELECT id FROM sessions WHERE training_id = ? AND id != ?'); $st->execute([$tid, $id]);
            if ($st->fetchColumn()) $fail('Für diesen Termin gibt es schon einen Plan.', 409);
        }
        if ($id) {
            $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($vals)));
            $st = db()->prepare("UPDATE sessions SET $set, updated_by = :by, updated_at = :at WHERE id = :id");
            $st->execute($vals + ['by' => $me['id'], 'at' => $now, 'id' => $id]);
            if (!$st->rowCount()) $fail('Diese Einheit gibt es nicht.', 404);
        } else {
            $cols = implode(', ', array_keys($vals)); $ph = ':' . implode(', :', array_keys($vals));
            db()->prepare("INSERT INTO sessions ($cols, created_by, updated_by, updated_at) VALUES ($ph, :by, :by, :at)")->execute($vals + ['by' => $me['id'], 'at' => $now]);
            $id = (int)db()->lastInsertId();
        }
        json_out(['ok' => true, 'id' => $id]);

    case 'session_delete':
        db()->prepare('DELETE FROM sessions WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
        json_out(['ok' => true]);
}
$fail('Unbekannte Aktion');
