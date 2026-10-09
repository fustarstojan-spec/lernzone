<?php
/*
 * Bisherige Trainingsbeteiligung übernehmen (einmalig, z. B. aus der Excel-Liste des Trainers).
 *   php tools/import_attendance.php storage/anwesenheit.csv [--saison=2026-06-30]
 *
 * CSV (Semikolon, erste Zeile Überschrift):  nr;datum;anwesend
 *   17;2026-06-30;1
 *   17;2026-07-01;0
 * - Nur Trikotnummer, Datum und da/nicht da – keine Namen, keine Gründe (Datenschutz).
 * - Pro Datum wird das Training an diesem Tag benutzt (z. B. aus dem Google-Kalender), sonst neu angelegt.
 * - Die Anwesenheit der Daten in der Datei wird ersetzt (erneuter Import ist gefahrlos).
 * - --saison setzt den Saisonbeginn: Die Trainingsbeteiligung zählt ab diesem Tag.
 * Die CSV gehört nicht ins Repository (storage/ ist ausgeschlossen).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
cli_team($argv);   // --team=N (Vorgabe: erste Mannschaft)
ob_end_clean();

$file = $argv[1] ?? '';
if ($file === '' || !is_file($file)) exit("Aufruf: php tools/import_attendance.php datei.csv [--saison=JJJJ-MM-TT]\n");
$season = '';
foreach (array_slice($argv, 2) as $a) if (preg_match('/^--saison=(\d{4}-\d{2}-\d{2})$/', $a, $m)) $season = $m[1];

$known = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));
$byDate = []; $skipped = [];
$fh = fopen($file, 'r');
fgetcsv($fh, 0, ';');                                             // Überschrift
while (($r = fgetcsv($fh, 0, ';')) !== false) {
    if (count($r) < 3) continue;
    [$nr, $date, $present] = [(int)$r[0], trim($r[1]), trim($r[2]) === '1'];
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) exit("Ungültiges Datum: $date\n");
    if (!in_array($nr, $known, true)) { $skipped[$nr] = true; continue; }
    $byDate[$date][$nr] = $present;
}
fclose($fh);
ksort($byDate);

$find = db()->prepare("SELECT id FROM trainings WHERE date = ? AND kind = 'training' ORDER BY cal_key = '', time LIMIT 1");
$new  = db()->prepare("INSERT INTO trainings (date, time, title, kind, note) VALUES (?, '', 'Training', 'training', 'aus der Excel-Liste')");
$del  = db()->prepare('DELETE FROM attendance WHERE training_id = ?');
$add  = db()->prepare('INSERT OR IGNORE INTO attendance (training_id, nr) VALUES (?, ?)');
$created = 0; $marks = 0;
db()->beginTransaction();
foreach ($byDate as $date => $list) {
    $find->execute([$date]);
    $id = (int)$find->fetchColumn();
    if (!$id) { $new->execute([$date]); $id = (int)db()->lastInsertId(); $created++; }
    $del->execute([$id]);
    foreach ($list as $nr => $p) if ($p) { $add->execute([$id, $nr]); $marks++; }
    db()->prepare('UPDATE trainings SET att_done = 1 WHERE id = ?')->execute([$id]);
}
if ($season !== '') db()->prepare("INSERT INTO settings (name, value) VALUES ('season_start', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value")->execute([$season]);
db()->commit();

printf("%d Trainings übernommen (%d neu angelegt), %d Anwesenheiten eingetragen.\n", count($byDate), $created, $marks);
if ($skipped) echo 'Nicht im Kader, übersprungen: Nr. ' . implode(', ', array_keys($skipped)) . "\n";
if ($season !== '') echo "Saisonbeginn: $season\n";
