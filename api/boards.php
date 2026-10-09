<?php
/*
 * Taktiktafel und Aufstellungen
 * GET               → Trainer: {ok, boards:[{id, title, kind, trainingId, game, shared, updated, by}], games:[{id, date, time, title, kind}]}
 *                     Spieler: {ok, boards:[…nur freigegebene]}
 * GET ?id=5         → {ok, board:{id, title, kind, trainingId, game, shared, data}}   (Spieler nur freigegebene; Nummern anderer Spieler werden ausgeblendet)
 * POST {action:"save", id?, title, kind, trainingId, shared, data}  → {ok, id}   (Trainer)
 * POST {action:"delete", id}                                          (Trainer)
 * data: {items:[{id, t:"own"|"opp"|"ball", x, y, lab, nr}], lines:[{id, k:"pass"|"run"|"line", f:[x,y], t:[x,y]}]}
 */
require __DIR__ . '/config.php';
require_login();
$coach = current_coach();
$user  = current_user();

$gameOf = function (?int $tid): ?array {
    if (!$tid) return null;
    $st = db()->prepare('SELECT id, date, time, title, kind FROM trainings WHERE id = ?'); $st->execute([$tid]);
    $g = $st->fetch(PDO::FETCH_ASSOC);
    return $g ? ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel', 'kind' => $g['kind']] : null;
};
$meta = fn(array $b) => ['id' => (int)$b['id'], 'title' => $b['title'], 'kind' => $b['kind'], 'trainingId' => $b['training_id'] ? (int)$b['training_id'] : null,
    'game' => $gameOf($b['training_id'] ? (int)$b['training_id'] : null), 'shared' => (bool)$b['shared'], 'updated' => $b['updated_at'],
    'by' => $b['updated_by'] ? (string)(db()->query('SELECT name FROM coaches WHERE id = ' . (int)$b['updated_by'])->fetchColumn() ?: '') : ''];

require_once __DIR__ . '/lib/board.php';   // board_clean()

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id'])) {
        $st = db()->prepare('SELECT * FROM boards WHERE id = ?'); $st->execute([(int)$_GET['id']]);
        $b = $st->fetch(PDO::FETCH_ASSOC);
        if (!$b || (!$coach && !$b['shared'])) json_out(['ok' => false, 'error' => 'Diese Tafel gibt es nicht.'], 404);
        $data = json_decode($b['data'], true) ?: ['items' => [], 'lines' => []];
        if (!$coach) {                                       // Datenschutz: Spieler sehen nur ihre eigene Nummer
            $mine = $user['nr'] ?? 0;
            foreach ($data['items'] as &$it) { if (($it['nr'] ?? 0) === $mine) $it['me'] = true; else unset($it['nr']); }
            unset($it);
        }
        json_out(['ok' => true, 'board' => $meta($b) + ['data' => $data]]);
    }
    if ($coach) {
        $boards = array_map($meta, db()->query('SELECT * FROM boards ORDER BY updated_at DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC));
        $g = db()->prepare("SELECT id, date, time, title, kind FROM trainings WHERE kind IN ('spiel', 'turnier') AND date >= ? AND date <= ? ORDER BY date, time");
        $g->execute([date('Y-m-d', strtotime('-14 days')), date('Y-m-d', strtotime('+60 days'))]);
        json_out(['ok' => true, 'boards' => $boards, 'games' => array_map(fn($x) => ['id' => (int)$x['id'], 'date' => $x['date'], 'time' => $x['time'],
                  'title' => $x['title'] ?: 'Spiel', 'kind' => $x['kind']], $g->fetchAll(PDO::FETCH_ASSOC))]);
    }
    json_out(['ok' => true, 'boards' => array_map($meta, db()->query('SELECT * FROM boards WHERE shared = 1 ORDER BY updated_at DESC LIMIT 30')->fetchAll(PDO::FETCH_ASSOC))]);
}

require_method('POST');
$me = require_coach();
$in = json_in();
switch ($in['action'] ?? '') {
    case 'save':
        $kind = ($in['kind'] ?? '') === 'lineup' ? 'lineup' : 'board';
        $tid = (int)($in['trainingId'] ?? 0) ?: null;
        if ($tid && !$gameOf($tid)) json_out(['ok' => false, 'error' => 'Dieses Spiel gibt es nicht.'], 400);
        $title = clean_text($in['title'] ?? '', 60) ?: ($kind === 'lineup' ? 'Aufstellung' : 'Taktiktafel');
        $data = json_encode(board_clean(is_array($in['data'] ?? null) ? $in['data'] : []), JSON_UNESCAPED_UNICODE);
        $shared = !empty($in['shared']) ? 1 : 0;
        $id = (int)($in['id'] ?? 0);
        if ($id) {
            $st = db()->prepare('UPDATE boards SET title = ?, kind = ?, training_id = ?, shared = ?, data = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?');
            $st->execute([$title, $kind, $tid, $shared, $data, $me['id'], $id]);
            if ($st->rowCount() === 0) json_out(['ok' => false, 'error' => 'Diese Tafel gibt es nicht mehr.'], 404);
        } else {
            db()->prepare('INSERT INTO boards (title, kind, training_id, shared, data, updated_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$title, $kind, $tid, $shared, $data, $me['id']]);
            $id = (int)db()->lastInsertId();
        }
        json_out(['ok' => true, 'id' => $id]);
    case 'delete':
        db()->prepare('DELETE FROM boards WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
        json_out(['ok' => true]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
