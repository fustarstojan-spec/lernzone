<?php
/*
 * Neuen Verein mit erster Mannschaft und Admin-Trainer freischalten (Plattform-Betreiber, echter Server).
 *   php tools/create_club.php "Vereinsname" "Mannschaft" "Trainer-Vorname" benutzername [--saison=25/26]
 *   php tools/create_club.php --liste                        → alle Vereine und Mannschaften mit ihrer Nummer (für --team=N)
 * Weitere Mannschaften legt der Admin danach selbst in der App an (Übersicht → Mannschaft).
 * Gibt einen Einmal-Code aus (72 Stunden gültig) – dem Trainer persönlich geben.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
ob_end_clean();

if (in_array('--liste', $argv, true)) {
    $rows = pdb()->query('SELECT t.id, c.name AS club, t.name, t.season, t.active,
                                 (SELECT COUNT(*) FROM memberships m WHERE m.team_id = t.id AND m.role = "coach") AS coaches,
                                 (SELECT COUNT(*) FROM memberships m WHERE m.team_id = t.id AND m.role = "player") AS players
                          FROM teams t JOIN clubs c ON c.id = t.club_id ORDER BY c.name, t.name')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) printf("--team=%-3d %s · %s%s  (%d Trainer, %d Spieler)%s\n", $r['id'], $r['club'], $r['name'],
                                 $r['season'] ? " ({$r['season']})" : '', $r['coaches'], $r['players'], $r['active'] ? '' : '  [inaktiv]');
    if (!$rows) echo "Noch keine Vereine.\n";
    exit;
}
$season = '';
foreach ($argv as $i => $a) if (preg_match('/^--saison=(.{1,20})$/u', $a, $m)) { $season = $m[1]; unset($argv[$i]); }
$argv = array_values($argv);
$club = clean_text($argv[1] ?? '', 60);
$team = clean_text($argv[2] ?? '', 40);
$name = clean_text($argv[3] ?? '', 30);
$user = clean_username($argv[4] ?? '');
if ($club === '' || $team === '' || $name === '' || !username_ok($user))
    exit("Aufruf: php tools/create_club.php \"Vereinsname\" \"Mannschaft\" \"Trainer-Vorname\" benutzername [--saison=25/26]\n");
if (username_taken($user)) exit("Der Benutzername $user ist schon vergeben.\n");
$st = pdb()->prepare('SELECT id FROM clubs WHERE name = ?'); $st->execute([$club]);
if ($st->fetchColumn()) exit("Den Verein „{$club}“ gibt es schon. Neue Mannschaften legt dessen Admin in der App an.\n");

pdb()->prepare('INSERT INTO clubs (name) VALUES (?)')->execute([$club]);
$tid = create_team((int)pdb()->lastInsertId(), $team, $season);
$_SESSION['team'] = $tid;
db($tid);   // Mannschafts-Datenbank anlegen
$aid = create_account($user, 'coach', create_coach($name), true, $tid);
echo "Verein „{$club}“ mit Mannschaft „{$team}“ angelegt (--team=$tid).\nAdmin: $name\nBenutzername: $user\nEinmal-Code:  " . issue_code($aid) . "  (72 Stunden gültig)\n";
