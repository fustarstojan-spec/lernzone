<?php
/*
 * IEP (Individueller Entwicklungsplan) aus einer JSON-Datei übernehmen – einmalig, z. B. aus der IEP-Excel des Trainers.
 *   php tools/import_iep.php storage/iep.json [--ueberschreiben]
 * JSON: { "7": {goals:{ind,tech,phys,off,def:[…]}, plan:{short,mid,long}, season, coach:{…}}, … }   Schlüssel = Trikotnummer, keine Namen.
 * Ohne --ueberschreiben werden vorhandene IEPs nicht verändert. Die JSON gehört nicht ins Repository (storage/ ist ausgeschlossen).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
ob_end_clean();
$file = $argv[1] ?? '';
if (!is_file($file)) exit("Aufruf: php tools/import_iep.php datei.json [--ueberschreiben]\n");
$over = in_array('--ueberschreiben', $argv, true);
$all = json_decode((string)file_get_contents($file), true) ?: [];
$known = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));
$sql = $over ? 'INSERT INTO iep (nr, data) VALUES (?, ?) ON CONFLICT(nr) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP'
             : 'INSERT OR IGNORE INTO iep (nr, data) VALUES (?, ?)';
$st = db()->prepare($sql); $n = 0; $skip = [];
foreach ($all as $nr => $d) {
    if (!in_array((int)$nr, $known, true)) { $skip[] = $nr; continue; }
    $st->execute([(int)$nr, json_encode($d, JSON_UNESCAPED_UNICODE)]); $n += $st->rowCount();
}
echo "$n IEP übernommen.\n";
if ($skip) echo 'Nicht im Kader: Nr. ' . implode(', ', $skip) . "\n";
