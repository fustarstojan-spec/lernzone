<?php
/*
 * Kader für Spiele (ab 0.31.0)
 * Trainer:
 *   GET ?id=5        → {ok, game:{id, date, time, title, kind, type, typeAuto}, announced, announcedAt, players:[{nr, status, reason, note}],
 *                       reasons:{key:text}, types:{key:text}, lineup:{starters:[nr], bench:[nr]}|null}
 *   GET ?settings=1  → {ok, durations:{liga, freundschaft, pokal, turnier}, pauses:{…}, types}
 *   POST {action:"set", id, nr, status:"kader"|"out"|"", reason, note}
 *   POST {action:"all", id, status:"kader"|""}        alle Spieler auf einmal
 *   POST {action:"lineup", id}                         aus der Aufstellung übernehmen
 *   POST {action:"announce", id, on}                   bekannt geben / zurücknehmen
 *   POST {action:"type", id, type}                     Spielart für dieses Spiel ('' = automatisch)
 *   POST {action:"durations", durations:{…}, pauses:{…}}  Spielzeit und Halbzeitpausen je Spielart (Cheftrainer)
 * Spieler sehen ihren eigenen Status über api/my.php (games), nie Notizen und nie andere Kinder.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/matchday.php';
$me = require_coach();

$game = function (int $id): ?array {
    $st = db()->prepare("SELECT t.id, t.date, t.time, t.title, t.kind, COALESCE(c.gtype, '') AS gtype, COALESCE(c.announced, 0) AS announced, c.announced_at
                         FROM trainings t LEFT JOIN match_calls c ON c.training_id = t.id WHERE t.id = ? AND t.kind IN ('spiel', 'turnier')");
    $st->execute([$id]); return $st->fetch(PDO::FETCH_ASSOC) ?: null;
};
$lineup = function (int $id): ?array {
    $st = db()->prepare("SELECT data FROM boards WHERE kind = 'lineup' AND training_id = ? ORDER BY updated_at DESC LIMIT 1"); $st->execute([$id]);
    $d = $st->fetchColumn(); if ($d === false) return null;
    $d = json_decode($d, true) ?: [];
    $s = array_values(array_unique(array_map(fn($i) => (int)$i['nr'], array_filter($d['items'] ?? [], fn($i) => ($i['t'] ?? '') === 'own' && !empty($i['nr'])))));
    $b = array_values(array_diff(array_map('intval', $d['bench'] ?? []), $s));
    return ['starters' => $s, 'bench' => $b];
};
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
$touch = fn(int $id) => db()->prepare('INSERT INTO match_calls (training_id, updated_by) VALUES (?, ?) ON CONFLICT(training_id) DO UPDATE SET updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP')->execute([$id, $me['id']]);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['settings'])) json_out(['ok' => true, 'durations' => game_durations(), 'pauses' => game_pauses(), 'types' => GAME_TYPES]);
    $id = (int)($_GET['id'] ?? 0); $g = $game($id);
    if (!$g) $fail('Dieses Spiel gibt es nicht.', 404);
    $st = db()->prepare('SELECT nr, status, reason, note FROM match_call_players WHERE training_id = ? ORDER BY nr'); $st->execute([$id]);
    $players = array_map(fn($r) => ['nr' => (int)$r['nr'], 'status' => $r['status'], 'reason' => $r['reason'], 'note' => $r['note']], $st->fetchAll(PDO::FETCH_ASSOC));
    json_out(['ok' => true,
        'game' => ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel', 'kind' => $g['kind'],
                   'type' => game_type($g['kind'], (string)$g['title'], $g['gtype']), 'typeAuto' => $g['gtype'] === '', 'duration' => game_durations()[game_type($g['kind'], (string)$g['title'], $g['gtype'])],
                   'pauses' => game_pauses()[game_type($g['kind'], (string)$g['title'], $g['gtype'])]],
        'announced' => (bool)$g['announced'], 'announcedAt' => $g['announced_at'], 'players' => $players,
        'reasons' => KADER_REASONS, 'types' => GAME_TYPES, 'lineup' => $lineup($id)]);
}

require_method('POST');
$in = json_in(); $action = (string)($in['action'] ?? '');
if ($action === 'durations') {
    if (!$me['isAdmin']) $fail('Das dürfen Cheftrainer.', 403);
    $d = [];
    foreach (GAME_DURATION_DEFAULT as $k => $def) { $v = int_in($in['durations'][$k] ?? null, 1, 240); if ($v === null) $fail('Spielzeit bitte zwischen 1 und 240 Minuten.'); $d[$k] = $v; }
    $pz = [];
    foreach (GAME_PAUSES_DEFAULT as $k => $def) { $v = int_in($in['pauses'][$k] ?? $def, 0, 5); if ($v === null) $fail('Halbzeitpausen bitte zwischen 0 und 5.'); $pz[$k] = $v; }
    $set = db()->prepare("INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value");
    $set->execute(['match_durations', json_encode($d)]); $set->execute(['match_pauses', json_encode($pz)]);
    json_out(['ok' => true, 'durations' => game_durations(), 'pauses' => game_pauses()]);
}
$id = (int)($in['id'] ?? 0); $g = $game($id);
if (!$g) $fail('Dieses Spiel gibt es nicht.', 404);
$known = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));

switch ($action) {
    case 'set':
        $nr = int_in($in['nr'] ?? null, 1, 99);
        if ($nr === null || !in_array($nr, $known, true)) $fail('Diesen Spieler gibt es nicht.');
        $status = (string)($in['status'] ?? '');
        if ($status === '') db()->prepare('DELETE FROM match_call_players WHERE training_id = ? AND nr = ?')->execute([$id, $nr]);
        else {
            if (!in_array($status, ['kader', 'out'], true)) $fail('Ungültiger Status.');
            $reason = $status === 'out' && isset(KADER_REASONS[$in['reason'] ?? '']) ? $in['reason'] : '';
            $note = $status === 'out' ? clean_text($in['note'] ?? '', 300) : '';
            db()->prepare('INSERT INTO match_call_players (training_id, nr, status, reason, note) VALUES (?, ?, ?, ?, ?)
                           ON CONFLICT(training_id, nr) DO UPDATE SET status = excluded.status, reason = excluded.reason, note = excluded.note')
                ->execute([$id, $nr, $status, $reason, $note]);
        }
        $touch($id); json_out(['ok' => true]);
    case 'all':
        $status = ($in['status'] ?? '') === 'kader' ? 'kader' : '';
        if ($status === '') db()->prepare('DELETE FROM match_call_players WHERE training_id = ?')->execute([$id]);
        else { $up = db()->prepare("INSERT INTO match_call_players (training_id, nr, status) VALUES (?, ?, 'kader') ON CONFLICT(training_id, nr) DO UPDATE SET status = 'kader', reason = '', note = ''");
               foreach ($known as $nr) $up->execute([$id, $nr]); }
        $touch($id); json_out(['ok' => true]);
    case 'lineup':
        $l = $lineup($id);
        if (!$l || !($l['starters'] || $l['bench'])) $fail('Für dieses Spiel gibt es noch keine Aufstellung.');
        kader_from_lineup($id, $l['starters'], $l['bench'], $me['id']);
        json_out(['ok' => true]);
    case 'announce':
        $on = !empty($in['on']);
        $touch($id);
        db()->prepare('UPDATE match_calls SET announced = ?, announced_at = ? WHERE training_id = ?')->execute([$on ? 1 : 0, $on ? date('Y-m-d H:i') : null, $id]);
        json_out(['ok' => true]);
    case 'type':
        $t = (string)($in['type'] ?? ''); if ($t !== '' && !isset(GAME_TYPES[$t])) $fail('Unbekannte Spielart.');
        $touch($id);
        db()->prepare('UPDATE match_calls SET gtype = ? WHERE training_id = ?')->execute([$t, $id]);
        json_out(['ok' => true]);
}
$fail('Unbekannte Aktion');
