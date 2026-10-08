<?php
// GET  → {quiz:{}, tasks:{}}
// POST {quiz:{}, tasks:{}} → {ok}
require __DIR__ . '/config.php';
$user = require_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $st = db()->prepare('SELECT data FROM progress WHERE nr = ?');
    $st->execute([$user['nr']]);
    $data = $st->fetchColumn();
    if ($data) { echo $data; exit; }
    json_out(['quiz' => new stdClass(), 'tasks' => new stdClass()]);
}

require_method('POST');
$in = json_decode(file_get_contents('php://input') ?: '{}');   // als Objekte, damit {"0":true} nicht zu [true] wird
$clean = [
    'quiz'  => (isset($in->quiz)  && is_object($in->quiz))  ? $in->quiz  : new stdClass(),
    'tasks' => (isset($in->tasks) && is_object($in->tasks)) ? $in->tasks : new stdClass(),
];
$json = json_encode($clean, JSON_UNESCAPED_UNICODE);
if (strlen($json) > 64000) json_out(['ok' => false, 'error' => 'Daten zu groß'], 413);

$st = db()->prepare('INSERT INTO progress (nr, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(nr) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP');
$st->execute([$user['nr'], $json]);
json_out(['ok' => true]);
