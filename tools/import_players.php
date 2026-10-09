<?php
/*
 * Kader aus data/players.json in die Datenbank übernehmen (echter Server).
 *   php tools/import_players.php        → alle Spieler aus der Datei, die noch fehlen
 * Jeder neue Spieler bekommt den Benutzernamen spielerNN und einen Einmal-Code (72 Stunden gültig).
 * Die Liste wird EINMAL ausgegeben – ausdrucken, verteilen, nicht speichern.
 * Benutzernamen kannst du danach im Trainer-Bereich ändern.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Nur über die Kommandozeile.'); }
$_SERVER['REQUEST_METHOD'] = 'CLI';
ob_start();
require __DIR__ . '/../api/config.php';
cli_team($argv);   // --team=N (Vorgabe: erste Mannschaft)
ob_end_clean();

$players = json_decode((string)file_get_contents(__DIR__ . '/../data/players.json'), true) ?: [];
$exists  = db()->prepare('SELECT COUNT(*) FROM players WHERE nr = ?');
echo "Nr.  Benutzername      Einmal-Code\n-------------------------------------\n";
foreach ($players as $p) {
    $exists->execute([$p['nr']]);
    if ((int)$exists->fetchColumn() > 0) continue;
    db()->prepare("INSERT INTO players (nr, pos, plan, pos_off, pos_def, pin_hash) VALUES (?, ?, ?, ?, ?, '')")
        ->execute([$p['nr'], $p['pos'], $p['plan'], $p['posOff'] ?? '', $p['posDef'] ?? '']);
    $u = unique_username(pdb(), 'spieler' . $p['nr']);
    printf("%-4d %-17s %s\n", $p['nr'], $u, issue_code(create_account($u, 'player', (int)$p['nr'])));
}
