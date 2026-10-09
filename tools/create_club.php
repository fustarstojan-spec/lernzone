<?php
/*
 * Neuen Verein mit Vereinsadmin freischalten (Superadmin, echter Server). Geht auch in der App: Verwaltung → Plattform.
 *   php tools/create_club.php "Vereinsname" "Vorname Vereinsadmin" benutzername [--mannschaft=U14] [--saison=26/27]
 *   php tools/create_club.php --liste                        → alle Vereine und Mannschaften mit ihrer Nummer (für --team=N)
 * Der Vereinsadmin legt danach selbst Mannschaften an und lädt Trainer ein.
 * Gibt einen Einmal-Code aus (72 Stunden gültig) – dem Vereinsadmin persönlich geben.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
ob_end_clean();

if (in_array('--liste', $argv, true)) {
    foreach (pdb()->query('SELECT id, name, active FROM clubs ORDER BY name')->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $adm = pdb()->prepare('SELECT a.username FROM club_admins x JOIN accounts a ON a.id = x.account_id WHERE x.club_id = ?'); $adm->execute([$c['id']]);
        echo $c['name'] . ($c['active'] ? '' : '  [gesperrt]') . '  – Vereinsadmin: ' . (implode(', ', $adm->fetchAll(PDO::FETCH_COLUMN)) ?: '—') . "\n";
        $st = pdb()->prepare('SELECT t.id, t.name, t.season, t.active,
                                     (SELECT COUNT(*) FROM memberships m WHERE m.team_id = t.id AND m.role = "coach") AS coaches,
                                     (SELECT COUNT(*) FROM memberships m WHERE m.team_id = t.id AND m.role = "player") AS players
                              FROM teams t WHERE t.club_id = ? ORDER BY t.name'); $st->execute([$c['id']]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) printf("   --team=%-3d %s%s  (%d Trainer, %d Spieler)%s\n", $r['id'], $r['name'],
                                     $r['season'] ? " ({$r['season']})" : '', $r['coaches'], $r['players'], $r['active'] ? '' : '  [archiviert]');
    }
    exit;
}
$opt = ['mannschaft' => '', 'saison' => ''];
foreach ($argv as $i => $a) if (preg_match('/^--(mannschaft|saison)=(.{1,40})$/u', $a, $m)) { $opt[$m[1]] = $m[2]; unset($argv[$i]); }
$argv = array_values($argv);
$club = clean_text($argv[1] ?? '', 60);
$name = clean_text($argv[2] ?? '', 30);
$user = clean_username($argv[3] ?? '');
if ($club === '' || $name === '' || !username_ok($user))
    exit("Aufruf: php tools/create_club.php \"Vereinsname\" \"Vorname Vereinsadmin\" benutzername [--mannschaft=U14] [--saison=26/27]\n");
if (username_taken($user)) exit("Der Benutzername $user ist schon vergeben.\n");
$st = pdb()->prepare('SELECT id FROM clubs WHERE name = ?'); $st->execute([$club]);
if ($st->fetchColumn()) exit("Den Verein „{$club}“ gibt es schon.\n");

pdb()->prepare('INSERT INTO clubs (name) VALUES (?)')->execute([$club]);
$cid = (int)pdb()->lastInsertId();
$coach = create_coach($name);
pdb()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw) VALUES (?, 'coach', ?, 1)")->execute([$user, $coach]);
$aid = (int)pdb()->lastInsertId();
pdb()->prepare('INSERT INTO club_admins (account_id, club_id) VALUES (?, ?)')->execute([$aid, $cid]);
echo "Verein „{$club}“ angelegt.\nVereinsadmin: $name\nBenutzername: $user\nEinmal-Code:  " . issue_code($aid) . "  (72 Stunden gültig)\n";
if ($opt['mannschaft'] !== '') {
    $tid = create_team($cid, clean_text($opt['mannschaft'], 40), clean_text($opt['saison'], 20));
    db($tid);
    echo "Mannschaft „" . clean_text($opt['mannschaft'], 40) . "“ angelegt (--team=$tid).\n";
}
