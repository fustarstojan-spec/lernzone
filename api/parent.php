<?php
/*
 * Eltern-Bereich (ab 0.37.0, nur Elternkonten, nur das gewählte Kind)
 * GET → {ok, nr, team, children:[{team, nr, teamName, club}], consent, consentInfo, consentVersion,
 *        upcoming:[…] (nächste Trainings mit Absage, wie beim Kind), reasons, games:[…] (bekannt gegebene Kader, nur eigenes Kind),
 *        progress:{quiz:{id:{best, of}}}}
 *   Eltern sehen NICHT: Befinden, Profil, IEP, Noten, Notizen, Spielzeiten, andere Kinder.
 * POST {action:"switch", team, nr}                     → anderes eigenes Kind wählen
 * POST {action:"consent", give:true, data:true, health:true} → Einwilligung digital erteilen (beide Häkchen nötig)
 * POST {action:"consent", give:false}                  → widerrufen: Profil, Befinden und Selbsteinschätzungen werden gelöscht
 * Absagen: api/absence.php (gleiche Regeln wie für das Kind)
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/matchday.php';
require_login();
$acc = current_account();
if (!$acc || $acc['kind'] !== 'parent') json_out(['ok' => false, 'error' => 'Nur für Eltern.'], 403);

$out = function () use ($acc): never {
    $p = require_parent();
    calendar_refresh();
    $st = db()->prepare('SELECT data FROM progress WHERE nr = ?'); $st->execute([$p['nr']]);
    $prog = json_decode((string)($st->fetchColumn() ?: '{}'), true) ?: [];
    $quiz = [];
    foreach (($prog['quiz'] ?? []) as $k => $q) if (is_array($q) && isset($q['best'], $q['of'])) $quiz[(string)$k] = ['best' => (int)$q['best'], 'of' => (int)$q['of']];
    json_out(['ok' => true, 'nr' => $p['nr'], 'team' => team_info(), 'children' => parent_children((int)$acc['id']),
              'consent' => $p['consent'], 'consentInfo' => consent_info($p['nr']), 'consentVersion' => CONSENT_VERSION,
              'upcoming' => upcoming_for($p['nr']), 'reasons' => ABSENCE_REASONS, 'games' => games_for($p['nr']),
              'progress' => ['quiz' => (object)$quiz], 'me' => coach_state(), 'parent' => parent_state()]);
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') $out();

require_method('POST');
$in = json_in();
switch ($in['action'] ?? '') {
    case 'switch':
        if (!select_child($acc, (int)($in['team'] ?? 0), (int)($in['nr'] ?? 0))) json_out(['ok' => false, 'error' => 'Dieses Kind ist nicht mit deinem Zugang verknüpft.'], 403);
        $out();
    case 'consent':
        $p = require_parent();
        if (!empty($in['give'])) {
            if (empty($in['data']) || empty($in['health'])) json_out(['ok' => false, 'error' => 'Bitte beide Punkte bestätigen.'], 400);
            db()->prepare('UPDATE players SET consent = 1 WHERE nr = ?')->execute([$p['nr']]);
            consent_log($p['nr'], true, 'eltern', $acc);
            sec_log('consent', 'info', (int)$acc['id'], $acc['username'], "Nr. {$p['nr']}: Einwilligung digital erteilt (Fassung " . CONSENT_VERSION . ')');
        } else {
            consent_revoke_data($p['nr']);
            consent_log($p['nr'], false, 'eltern', $acc);
            sec_log('consent', 'warn', (int)$acc['id'], $acc['username'], "Nr. {$p['nr']}: Einwilligung widerrufen, Profil/Befinden/Selbsteinschätzung gelöscht");
        }
        $out();
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
