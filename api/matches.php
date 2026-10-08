<?php
/*
 * Spielzeiten (nur Trainer)
 * GET        → {ok, games:[{id, date, time, title, kind, recorded, duration, gf, ga, lineupId}], season:[{nr, name, plan, games, starts, apps, minutes, possible, pct}]}
 *              games = Spiele und Turniere seit Saisonbeginn bis in 14 Tagen
 * GET ?id=5  → {ok, game, match:{duration, gf, ga, squad:[{nr, starter}], subs:[{minute, out, in}]}|null, lineup:[nr]|null, minutes:{nr: min}}
 * POST {action:"save", id, duration, gf, ga, squad:[{nr, starter}], subs:[{minute, out, in}]}
 * POST {action:"clear", id}   Erfassung löschen
 */
require __DIR__ . '/config.php';
require_coach();

/* Minuten pro Spieler: Startelf ab 0, Wechsel in Minuten-Reihenfolge, Ende = Dauer */
function match_minutes(int $id): array {
    $m = db()->prepare('SELECT duration FROM matches WHERE training_id = ?'); $m->execute([$id]);
    $dur = (int)($m->fetchColumn() ?: 0); if (!$dur) return [];
    $sq = db()->prepare('SELECT nr, starter FROM match_squad WHERE training_id = ?'); $sq->execute([$id]);
    $on = []; $min = [];
    foreach ($sq->fetchAll(PDO::FETCH_ASSOC) as $r) { $min[(int)$r['nr']] = 0; if ($r['starter']) $on[(int)$r['nr']] = 0; }
    $su = db()->prepare('SELECT minute, nr_out, nr_in FROM match_subs WHERE training_id = ? ORDER BY minute, id'); $su->execute([$id]);
    foreach ($su->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $t = max(0, min($dur, (int)$s['minute']));
        $o = $s['nr_out'] !== null ? (int)$s['nr_out'] : null; $i = $s['nr_in'] !== null ? (int)$s['nr_in'] : null;
        if ($o !== null && isset($on[$o])) { $min[$o] = ($min[$o] ?? 0) + $t - $on[$o]; unset($on[$o]); }
        if ($i !== null && !isset($on[$i])) { $on[$i] = $t; $min[$i] ??= 0; }
    }
    foreach ($on as $nr => $from) $min[$nr] += $dur - $from;
    ksort($min);
    return $min;
}

$gameRow = function (int $id): ?array {
    $st = db()->prepare("SELECT id, date, time, title, kind FROM trainings WHERE id = ? AND kind IN ('spiel', 'turnier')"); $st->execute([$id]);
    $g = $st->fetch(PDO::FETCH_ASSOC);
    return $g ? ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel', 'kind' => $g['kind']] : null;
};
$lineupOf = function (int $id): ?array {
    $st = db()->prepare("SELECT data FROM boards WHERE kind = 'lineup' AND training_id = ? ORDER BY updated_at DESC LIMIT 1"); $st->execute([$id]);
    $d = $st->fetchColumn(); if ($d === false) return null;
    $d = json_decode($d, true) ?: [];
    return array_values(array_unique(array_map(fn($i) => (int)$i['nr'], array_filter($d['items'] ?? [], fn($i) => ($i['t'] ?? '') === 'own' && !empty($i['nr'])))));
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id'])) {
        $id = (int)$_GET['id']; $g = $gameRow($id);
        if (!$g) json_out(['ok' => false, 'error' => 'Dieses Spiel gibt es nicht.'], 404);
        $m = db()->prepare('SELECT * FROM matches WHERE training_id = ?'); $m->execute([$id]); $m = $m->fetch(PDO::FETCH_ASSOC);
        $match = null;
        if ($m) {
            $sq = db()->prepare('SELECT nr, starter FROM match_squad WHERE training_id = ? ORDER BY nr'); $sq->execute([$id]);
            $su = db()->prepare('SELECT minute, nr_out, nr_in FROM match_subs WHERE training_id = ? ORDER BY minute, id'); $su->execute([$id]);
            $match = ['duration' => (int)$m['duration'], 'gf' => $m['goals_for'] === null ? null : (int)$m['goals_for'], 'ga' => $m['goals_against'] === null ? null : (int)$m['goals_against'],
                'squad' => array_map(fn($r) => ['nr' => (int)$r['nr'], 'starter' => (bool)$r['starter']], $sq->fetchAll(PDO::FETCH_ASSOC)),
                'subs' => array_map(fn($r) => ['minute' => (int)$r['minute'], 'out' => $r['nr_out'] === null ? null : (int)$r['nr_out'], 'in' => $r['nr_in'] === null ? null : (int)$r['nr_in']], $su->fetchAll(PDO::FETCH_ASSOC))];
        }
        json_out(['ok' => true, 'game' => $g, 'match' => $match, 'lineup' => $lineupOf($id), 'minutes' => (object)match_minutes($id)]);
    }
    $season = (string)(db()->query("SELECT value FROM settings WHERE name = 'season_start'")->fetchColumn() ?: '2000-01-01');
    $st = db()->prepare("SELECT t.id, t.date, t.time, t.title, t.kind, m.duration, m.goals_for, m.goals_against
                         FROM trainings t LEFT JOIN matches m ON m.training_id = t.id
                         WHERE t.kind IN ('spiel', 'turnier') AND t.date >= ? AND t.date <= ? ORDER BY t.date DESC, t.time DESC");
    $st->execute([$season, date('Y-m-d', strtotime('+14 days'))]);
    $games = []; $stats = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $g) {
        $rec = $g['duration'] !== null;
        $games[] = ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel', 'kind' => $g['kind'], 'recorded' => $rec,
                    'duration' => $rec ? (int)$g['duration'] : null, 'gf' => $g['goals_for'] === null ? null : (int)$g['goals_for'], 'ga' => $g['goals_against'] === null ? null : (int)$g['goals_against'],
                    'lineupId' => null];
        if (!$rec) continue;
        $mins = match_minutes((int)$g['id']);
        $sq = db()->prepare('SELECT nr, starter FROM match_squad WHERE training_id = ?'); $sq->execute([$g['id']]);
        foreach ($sq->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $nr = (int)$r['nr']; $s = &$stats[$nr];
            $s ??= ['games' => 0, 'starts' => 0, 'apps' => 0, 'minutes' => 0, 'possible' => 0];
            $s['games']++; $s['possible'] += (int)$g['duration'];
            if ($r['starter']) $s['starts']++;
            $mm = $mins[$nr] ?? 0; $s['minutes'] += $mm; if ($mm > 0) $s['apps']++;
            unset($s);
        }
    }
    $rows = db()->query('SELECT nr, plan FROM players WHERE active = 1 ORDER BY nr')->fetchAll(PDO::FETCH_ASSOC);
    $out = array_map(function ($r) use ($stats) {
        $nr = (int)$r['nr']; $s = $stats[$nr] ?? ['games' => 0, 'starts' => 0, 'apps' => 0, 'minutes' => 0, 'possible' => 0];
        $prof = profile_of($nr);
        return ['nr' => $nr, 'plan' => $r['plan'], 'name' => trim(($prof['vorname'] ?? '') . ' ' . ($prof['nachname'] ?? ''))] + $s
             + ['pct' => $s['possible'] ? (int)round($s['minutes'] / $s['possible'] * 100) : null];
    }, $rows);
    json_out(['ok' => true, 'games' => $games, 'season' => $out]);
}

require_method('POST');
$in = json_in();
$id = (int)($in['id'] ?? 0);
if (!$gameRow($id)) json_out(['ok' => false, 'error' => 'Dieses Spiel gibt es nicht.'], 404);
if (($in['action'] ?? '') === 'clear') {
    foreach (['matches', 'match_squad', 'match_subs'] as $t) db()->prepare("DELETE FROM $t WHERE training_id = ?")->execute([$id]);
    json_out(['ok' => true]);
}
if (($in['action'] ?? '') !== 'save') json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);

$dur = int_in($in['duration'] ?? 70, 1, 240);
if ($dur === null) json_out(['ok' => false, 'error' => 'Spielzeit: 1 bis 240 Minuten.'], 400);
$goal = fn($v) => $v === null || $v === '' ? null : int_in($v, 0, 99);
$known = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));
$squad = [];
foreach (array_slice(is_array($in['squad'] ?? null) ? $in['squad'] : [], 0, 40) as $s) {
    $nr = (int)($s['nr'] ?? 0); if (in_array($nr, $known, true)) $squad[$nr] = !empty($s['starter']) ? 1 : 0;
}
$subs = [];
foreach (array_slice(is_array($in['subs'] ?? null) ? $in['subs'] : [], 0, 60) as $s) {
    $mi = int_in($s['minute'] ?? null, 0, $dur); if ($mi === null) continue;
    $o = isset($s['out']) && isset($squad[(int)$s['out']]) ? (int)$s['out'] : null;
    $i = isset($s['in']) && isset($squad[(int)$s['in']]) ? (int)$s['in'] : null;
    if ($o === null && $i === null) continue;
    $subs[] = [$mi, $o, $i];
}
db()->beginTransaction();
db()->prepare('INSERT INTO matches (training_id, duration, goals_for, goals_against) VALUES (?, ?, ?, ?)
               ON CONFLICT(training_id) DO UPDATE SET duration = excluded.duration, goals_for = excluded.goals_for, goals_against = excluded.goals_against, updated_at = CURRENT_TIMESTAMP')
    ->execute([$id, $dur, $goal($in['gf'] ?? null), $goal($in['ga'] ?? null)]);
db()->prepare('DELETE FROM match_squad WHERE training_id = ?')->execute([$id]);
db()->prepare('DELETE FROM match_subs WHERE training_id = ?')->execute([$id]);
$ins = db()->prepare('INSERT INTO match_squad (training_id, nr, starter) VALUES (?, ?, ?)');
foreach ($squad as $nr => $st) $ins->execute([$id, $nr, $st]);
$ins = db()->prepare('INSERT INTO match_subs (training_id, minute, nr_out, nr_in) VALUES (?, ?, ?, ?)');
foreach ($subs as [$mi, $o, $i]) $ins->execute([$id, $mi, $o, $i]);
db()->commit();
json_out(['ok' => true, 'minutes' => (object)match_minutes($id)]);
