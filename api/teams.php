<?php
/*
 * Mannschaften (ab 0.21.0)
 * GET                                  → {ok, current:{id, name, season, club}|null, teams:[{id, name, season, club, role, isAdmin}]}
 * POST {action:"switch", id}           → Mannschaft wechseln (eigene Mitgliedschaft nötig)
 * POST {action:"create", name, season} → neue Mannschaft im eigenen Verein (nur Admin einer Mannschaft dieses Vereins);
 *                                        der Ersteller wird dort Trainer und Admin
 */
require __DIR__ . '/config.php';
require_login();
$acc = current_account();

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'current' => team_info(), 'teams' => account_teams((int)$acc['id'])]);

$in = json_in();
switch ($in['action'] ?? '') {
    case 'switch':
        $id = (int)($in['id'] ?? 0);
        if (!select_team($id, $acc)) json_out(['ok' => false, 'error' => 'Zu dieser Mannschaft gehörst du nicht.'], 403);
        json_out(['ok' => true, 'user' => current_user(), 'coach' => coach_state(), 'team' => team_info()]);
    case 'create':
        $me = require_admin();
        $name = clean_text($in['name'] ?? '', 40);
        $season = clean_text($in['season'] ?? '', 20);
        if ($name === '') json_out(['ok' => false, 'error' => 'Bitte einen Namen eingeben, z. B. U15.'], 400);
        $club = team_info()['clubId'];
        $st = pdb()->prepare('SELECT COUNT(*) FROM teams WHERE club_id = ? AND name = ? AND season = ? AND active = 1');
        $st->execute([$club, $name, $season]);
        if ((int)$st->fetchColumn() > 0) json_out(['ok' => false, 'error' => 'Diese Mannschaft gibt es im Verein schon.'], 409);
        $team = create_team($club, $name, $season);
        pdb()->prepare("INSERT INTO memberships (account_id, team_id, role, ref, is_admin) VALUES (?, ?, 'coach', ?, 1)")->execute([$acc['id'], $team, $me['id']]);
        select_team($team, $acc);
        json_out(['ok' => true, 'user' => null, 'coach' => coach_state(), 'team' => team_info()]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
