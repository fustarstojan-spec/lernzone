<?php
/*
 * IEP (Individueller Entwicklungsplan) aus einer JSON-Datei übernehmen – einmalig, z. B. aus der IEP-Excel des Trainers.
 *   php tools/import_iep.php storage/iep.json [--ueberschreiben]
 * JSON: { "7": {goals:{ind,tech,phys,off,def:[…]}, plan:{short,mid,long}, season, coach:{…}}, … }   Schlüssel = Trikotnummer, keine Namen.
 * Legt neue Stände an (ältere bleiben erhalten). Ohne --ueberschreiben nur für Spieler ohne IEP. Die JSON gehört nicht ins Repository (storage/ ist ausgeschlossen).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
cli_team($argv);   // --team=N (Vorgabe: erste Mannschaft)
ob_end_clean();
$file = $argv[1] ?? '';
if (!is_file($file)) exit("Aufruf: php tools/import_iep.php datei.json [--ueberschreiben]\n");
$over = in_array('--ueberschreiben', $argv, true);
$all = json_decode((string)file_get_contents($file), true) ?: [];
$known = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));
// Jeder Import legt einen neuen Stand an; ohne --ueberschreiben nur für Spieler, die noch keinen IEP haben
$has = db()->prepare('SELECT COUNT(*) FROM iep_versions WHERE nr = ?');
$st = db()->prepare('INSERT INTO iep_versions (nr, data) VALUES (?, ?)'); $n = 0; $skip = [];
foreach ($all as $nr => $d) {
    if (!in_array((int)$nr, $known, true)) { $skip[] = $nr; continue; }
    $has->execute([(int)$nr]); if (!$over && (int)$has->fetchColumn() > 0) continue;
    $st->execute([(int)$nr, json_encode($d, JSON_UNESCAPED_UNICODE)]); $n++;
}
echo "$n IEP übernommen.\n";
if ($skip) echo 'Nicht im Kader: Nr. ' . implode(', ', $skip) . "\n";
