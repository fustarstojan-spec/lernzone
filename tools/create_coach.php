<?php
/*
 * Trainer-Konto in einer Mannschaft anlegen (echter Server, wo das Einrichten über die App gesperrt ist).
 *   php tools/create_coach.php "Vorname" benutzername [--team=N] [--admin]
 * Gibt einen Einmal-Code aus (72 Stunden gültig). Damit meldet sich der Trainer an und legt sein Passwort fest.
 * Der erste Trainer einer Mannschaft wird automatisch Admin.
 * Gibt es den Benutzernamen schon: zur Mannschaft hinzufügen (Passwort bleibt). Ist er schon dabei: neuer Einmal-Code.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
$team = cli_team($argv);
ob_end_clean();

$admin = in_array('--admin', $argv, true);
$argv  = array_values(array_diff($argv, ['--admin']));
$name  = trim($argv[1] ?? '');
$user  = clean_username($argv[2] ?? '');
if ($name === '' || !username_ok($user)) exit("Aufruf: php tools/create_coach.php \"Vorname\" benutzername [--team=N] [--admin]\n");

$st = pdb()->prepare("SELECT COUNT(*) FROM memberships WHERE team_id = ? AND role = 'coach'"); $st->execute([$team]);
$first = (int)$st->fetchColumn() === 0;
$t = team_info();
$st = pdb()->prepare('SELECT * FROM accounts WHERE username = ?'); $st->execute([$user]);
if ($a = $st->fetch(PDO::FETCH_ASSOC)) {
    if ($a['kind'] !== 'coach') exit("$user ist ein Spieler-Konto.\n");
    if (!account_for('coach', (int)$a['ref'])) {
        pdb()->prepare("INSERT INTO memberships (account_id, team_id, role, ref, is_admin) VALUES (?, ?, 'coach', ?, ?)")
            ->execute([$a['id'], $team, $a['ref'], ($first || $admin) ? 1 : 0]);
        exit("$user zu {$t['club']} · {$t['name']} hinzugefügt – meldet sich mit dem bisherigen Passwort an.\n");
    }
    echo "Neuer Einmal-Code für $user: " . issue_code((int)$a['id']) . "  (bisheriges Passwort ist damit ungültig)\n";
    exit;
}
$aid = create_account($user, 'coach', create_coach($name), $first || $admin);
echo "Trainer $name in {$t['club']} · {$t['name']} angelegt" . (($first || $admin) ? ' (Admin)' : '') . ".\nBenutzername: $user\nEinmal-Code:  " . issue_code($aid) . "  (72 Stunden gültig)\n";
