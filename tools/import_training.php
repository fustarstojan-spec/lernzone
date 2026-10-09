<?php
/*
 * Übungen und Einheiten aus einer JSON-Datei übernehmen (ab 0.24.0).
 *   php tools/import_training.php storage/training-import.json [--team=N]
 * Format: {drills:[{title, topic, phase, block, minutes, players, organisation, ablauf, coaching, easier, harder, load, material, draft}],
 *          sessions:[{date, title, focus, phase, goal, players, blocks:{einstimmung:[{drill:"Titel", min, note}], uebung, spiel, ausklang}}]}
 * Übungen landen in der Bibliothek des Vereins der Mannschaft; vorhandene (gleicher Titel) werden übersprungen,
 * bekommen aber ihr Bild, falls sie noch keins haben. image: Pfad relativ zur JSON-Datei.
 * Einheiten werden dem Training am selben Tag zugeordnet (falls im Kalender); vorhandene Pläne bleiben unverändert.
 * Die Datei liegt in storage/ und kommt nicht ins Repository (Inhalte des Trainers).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib/drill_image.php';
$team = cli_team($argv);
ob_end_clean();

$file = $argv[1] ?? '';
$in = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
if (!is_array($in)) exit("Aufruf: php tools/import_training.php datei.json [--team=N]\n");
$club = (int)team_row($team)['club_id'];
$st = pdb()->prepare("SELECT ref FROM memberships WHERE team_id = ? AND role = 'coach' ORDER BY is_admin DESC, ref LIMIT 1"); $st->execute([$team]);
$coach = (int)$st->fetchColumn() ?: null;
$now = date('Y-m-d H:i');

$ids = [];
$find = pdb()->prepare('SELECT id FROM drills WHERE club_id = ? AND title = ? AND active = 1');
$cols = ['title', 'topic', 'phase', 'block', 'minutes', 'players', 'organisation', 'ablauf', 'coaching', 'easier', 'harder', 'load', 'material'];
$ins = pdb()->prepare('INSERT INTO drills (club_id, ' . implode(', ', $cols) . ', draft, created_by, updated_by, updated_at) VALUES (?' . str_repeat(', ?', count($cols)) . ', ?, ?, ?, ?)');
$newD = 0; $imgs = 0;
$addImage = function (int $id, array $d) use ($file, $club, &$imgs) {
    if (empty($d['image'])) return;
    $st = pdb()->prepare('SELECT image FROM drills WHERE id = ?'); $st->execute([$id]);
    if ((string)$st->fetchColumn() !== '') return;
    $path = dirname($file) . '/' . $d['image'];
    if (!is_file($path)) { echo "Bild fehlt: {$d['image']}\n"; return; }
    $rel = drill_image_store($club, $id, (string)file_get_contents($path));
    if (str_starts_with($rel, '!')) { echo substr($rel, 1) . " ({$d['image']})\n"; return; }
    pdb()->prepare('UPDATE drills SET image = ? WHERE id = ?')->execute([$rel, $id]); $imgs++;
};
foreach ($in['drills'] ?? [] as $d) {
    $find->execute([$club, $d['title']]);
    if ($id = $find->fetchColumn()) { $ids[$d['title']] = (int)$id; $addImage((int)$id, $d); continue; }
    $ins->execute(array_merge([$club], array_map(fn($c) => $d[$c] ?? ($c === 'minutes' ? 0 : ''), $cols), [!empty($d['draft']) ? 1 : 0, $coach, $coach, $now]));
    $ids[$d['title']] = $id = (int)pdb()->lastInsertId(); $newD++;
    $addImage($id, $d);
}
$newS = 0; $skip = 0;
foreach ($in['sessions'] ?? [] as $s) {
    $t = db()->prepare("SELECT id FROM trainings WHERE kind = 'training' AND date = ? ORDER BY time LIMIT 1"); $t->execute([$s['date']]);
    $tid = $t->fetchColumn() ?: null;
    $chk = db()->prepare($tid ? 'SELECT COUNT(*) FROM sessions WHERE training_id = ?' : 'SELECT COUNT(*) FROM sessions WHERE date = ? AND title = ?');
    $chk->execute($tid ? [$tid] : [$s['date'], $s['title']]);
    if ((int)$chk->fetchColumn()) { $skip++; continue; }
    $blocks = [];
    foreach (['einstimmung', 'uebung', 'spiel', 'ausklang'] as $b)
        $blocks[$b] = array_map(fn($i) => ['drill' => $ids[$i['drill']] ?? null, 'min' => (int)($i['min'] ?? 0), 'note' => (string)($i['note'] ?? '')], $s['blocks'][$b] ?? []);
    db()->prepare('INSERT INTO sessions (training_id, date, title, focus, phase, goal, players, notes, data, created_by, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$tid, $s['date'], $s['title'], $s['focus'] ?? '', $s['phase'] ?? '', $s['goal'] ?? '', $s['players'] ?? '', $s['notes'] ?? '',
                   json_encode(['blocks' => $blocks], JSON_UNESCAPED_UNICODE), $coach, $coach, $now]);
    $newS++;
    echo "Einheit {$s['date']} „{$s['title']}“" . ($tid ? '' : ' (kein Training im Kalender an diesem Tag)') . "\n";
}
echo "Übungen neu: $newD · Bilder: $imgs · Einheiten neu: $newS" . ($skip ? " · übersprungen (Plan vorhanden): $skip" : '') . "\n";
