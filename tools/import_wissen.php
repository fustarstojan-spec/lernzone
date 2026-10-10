<?php
/*
 * Trainer-Wissen aus einer JSON-Datei übernehmen (ab 0.27.0).
 *   php tools/import_wissen.php storage/wissen-import.json [--team=N]
 * Format: {pages:[{stage, title, body, source, draft, sort}], links:[{stage, category, phase, title, url, source, sort}]}
 * Landet beim Verein der Mannschaft. Vorhandene Einträge (gleiche Art und gleicher Titel in derselben Stufe) werden übersprungen.
 * Die Datei liegt in storage/ und kommt nicht ins Repository (Inhalte des Trainers).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
$team = cli_team($argv);
ob_end_clean();

$file = $argv[1] ?? '';
$in = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
if (!is_array($in)) exit("Aufruf: php tools/import_wissen.php datei.json [--team=N]\n");
$club = (int)team_row($team)['club_id'];
$st = pdb()->prepare("SELECT ref FROM memberships WHERE team_id = ? AND role = 'coach' ORDER BY is_admin DESC, ref LIMIT 1"); $st->execute([$team]);
$coach = (int)$st->fetchColumn() ?: null;
$now = date('Y-m-d H:i');
$stages = ['grundlagen', 'aufbau', 'leistung', 'alle'];

$find = pdb()->prepare('SELECT COUNT(*) FROM knowledge WHERE club_id = ? AND kind = ? AND stage = ? AND title = ? AND active = 1');
$ins = pdb()->prepare('INSERT INTO knowledge (club_id, kind, stage, category, phase, title, body, url, source, draft, sort, updated_by, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$new = ['page' => 0, 'link' => 0]; $skip = 0; $bad = 0;
foreach (['page' => $in['pages'] ?? [], 'link' => $in['links'] ?? []] as $kind => $rows) foreach ($rows as $r) {
    $stage = in_array($r['stage'] ?? '', $stages, true) ? $r['stage'] : 'alle';
    $title = trim((string)($r['title'] ?? ''));
    $url = (string)($r['url'] ?? '');
    if ($title === '' || ($kind === 'link' && !preg_match('#^https://\S+$#', $url))) { $bad++; continue; }
    $find->execute([$club, $kind, $stage, $title]);
    if ((int)$find->fetchColumn()) { $skip++; continue; }
    $phase = preg_match('/^[A-D][1-3]$/', (string)($r['phase'] ?? '')) ? $r['phase'] : '';
    $ins->execute([$club, $kind, $stage, (string)($r['category'] ?? ''), $phase, $title, $kind === 'page' ? (string)($r['body'] ?? '') : '',
                   $kind === 'link' ? $url : '', (string)($r['source'] ?? ''), !empty($r['draft']) ? 1 : 0, (int)($r['sort'] ?? 0), $coach, $now]);
    $new[$kind]++;
}
echo "Verein $club: {$new['page']} Seiten und {$new['link']} Materialien neu, $skip schon vorhanden" . ($bad ? ", $bad fehlerhaft" : '') . ".\n";
