<?php
/*
 * Mannschaften (ab 0.21.0)
 * GET                                  → {ok, current:{id, name, season, club}|null, teams:[{id, name, season, club, role, isAdmin}]}
 * POST {action:"switch", id}           → Mannschaft wechseln (eigene Mitgliedschaft nötig)
 * Neue Mannschaften legt der Vereinsadmin an (api/admin.php, ab 0.22.0).
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
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
