<?php
/*
 * Individueller Entwicklungsplan (IEP) und Selbsteinschätzung
 * Spieler:  GET          → {ok, iep:{goals, plan, season}|null, rate:{game:{id, date, time, title}, values:{area: 1–5}, open}|null, consent}
 *           POST {action:"rate", id, area, value}   (Einwilligung nötig; bis 3 Tage nach dem Spiel)
 * Trainer:  GET ?nr=7    → {ok, iep:{goals, plan, season, coach}|null, ratings:[{id, date, title, values}]}
 *           POST {action:"save", nr, data}
 * Bereiche: ind (Individuelles Ziel) · tech (Technik) · phys (Physis) · off (Offensiv) · def (Defensiv)
 */
require __DIR__ . '/config.php';
require_login();
const IEP_AREAS = ['ind', 'tech', 'phys', 'off', 'def'];
const IEP_RATE_DAYS = 3;

function iep_of(int $nr): ?array {
    $st = db()->prepare('SELECT data FROM iep WHERE nr = ?'); $st->execute([$nr]);
    $d = $st->fetchColumn();
    return $d === false ? null : (json_decode($d, true) ?: null);
}
/* Spiel, das der Spieler gerade bewerten kann: letztes begonnenes Spiel/Turnier der letzten 3 Tage */
function iep_rate_game(): ?array {
    $st = db()->prepare("SELECT id, date, time, title FROM trainings WHERE kind IN ('spiel', 'turnier') AND date >= ? AND date <= ? ORDER BY date DESC, time DESC");
    $st->execute([date('Y-m-d', strtotime('-' . IEP_RATE_DAYS . ' days')), today()]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $g)
        if (strtotime($g['date'] . ' ' . ($g['time'] ?: '00:00')) <= time())
            return ['id' => (int)$g['id'], 'date' => $g['date'], 'time' => $g['time'], 'title' => $g['title'] ?: 'Spiel'];
    return null;
}
function iep_values(int $nr, int $tid): array {
    $st = db()->prepare('SELECT area, value FROM iep_ratings WHERE nr = ? AND training_id = ?'); $st->execute([$nr, $tid]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_KEY_PAIR));
}
function iep_clean($d): array {
    $list = fn($a) => array_values(array_filter(array_map(fn($x) => clean_text($x, 200), array_slice(is_array($a) ? $a : [], 0, 12)), fn($x) => $x !== ''));
    $g = is_array($d['goals'] ?? null) ? $d['goals'] : [];
    $p = is_array($d['plan'] ?? null) ? $d['plan'] : [];
    $c = is_array($d['coach'] ?? null) ? $d['coach'] : [];
    $out = ['goals' => [], 'plan' => [], 'season' => clean_text($d['season'] ?? '', 40), 'coach' => []];
    foreach (IEP_AREAS as $a) $out['goals'][$a] = $list($g[$a] ?? []);
    foreach (['short', 'mid', 'long'] as $k) $out['plan'][$k] = clean_text($p[$k] ?? '', 300);
    foreach (['strengths', 'field', 'psych', 'talkDate', 'status', 'feedback', 'learn', 'mental', 'measures', 'observe'] as $k) $out['coach'][$k] = clean_text($c[$k] ?? '', 400);
    $out['coach']['clusters'] = $list($c['clusters'] ?? []);
    return $out;
}

$coach = current_coach();
$user  = current_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($coach && isset($_GET['nr'])) {
        $nr = (int)$_GET['nr'];
        $st = db()->prepare("SELECT r.training_id, t.date, t.title, r.area, r.value FROM iep_ratings r JOIN trainings t ON t.id = r.training_id
                             WHERE r.nr = ? ORDER BY t.date DESC, t.time DESC");
        $st->execute([$nr]);
        $rat = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $k = (int)$r['training_id'];
            $rat[$k] ??= ['id' => $k, 'date' => $r['date'], 'title' => $r['title'] ?: 'Spiel', 'values' => []];
            $rat[$k]['values'][$r['area']] = (int)$r['value'];
        }
        json_out(['ok' => true, 'iep' => iep_of($nr), 'ratings' => array_values(array_map(fn($x) => $x + ['values' => (object)$x['values']], $rat))]);
    }
    if (!$user) json_out(['ok' => false, 'error' => 'Nur für Spieler.'], 403);
    $i = iep_of($user['nr']);
    $g = $i ? iep_rate_game() : null;
    json_out(['ok' => true, 'consent' => $user['consent'],
              'iep' => $i ? ['goals' => $i['goals'] ?? [], 'plan' => $i['plan'] ?? [], 'season' => $i['season'] ?? ''] : null,   // ohne Trainer-Notizen
              'rate' => $g ? ['game' => $g, 'values' => (object)iep_values($user['nr'], $g['id'])] : null]);
}

require_method('POST');
$in = json_in();
switch ($in['action'] ?? '') {
    case 'rate':
        $u = require_user(); require_consent($u);
        $g = iep_rate_game();
        if (!$g || $g['id'] !== (int)($in['id'] ?? 0)) json_out(['ok' => false, 'error' => 'Bewerten geht nur bis ' . IEP_RATE_DAYS . ' Tage nach dem Spiel.'], 400);
        $area = (string)($in['area'] ?? ''); $v = int_in($in['value'] ?? null, 1, 5);
        if (!in_array($area, IEP_AREAS, true) || $v === null) json_out(['ok' => false, 'error' => 'Ungültige Eingabe.'], 400);
        db()->prepare('INSERT INTO iep_ratings (nr, training_id, area, value) VALUES (?, ?, ?, ?)
                       ON CONFLICT(nr, training_id, area) DO UPDATE SET value = excluded.value, created_at = CURRENT_TIMESTAMP')->execute([$u['nr'], $g['id'], $area, $v]);
        json_out(['ok' => true, 'values' => (object)iep_values($u['nr'], $g['id'])]);
    case 'save':
        $me = require_coach();
        $nr = int_in($in['nr'] ?? null, 1, 99);
        if ($nr === null) json_out(['ok' => false, 'error' => 'Ungültige Nummer.'], 400);
        $data = json_encode(iep_clean(is_array($in['data'] ?? null) ? $in['data'] : []), JSON_UNESCAPED_UNICODE);
        db()->prepare('INSERT INTO iep (nr, data, updated_by) VALUES (?, ?, ?)
                       ON CONFLICT(nr) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by')->execute([$nr, $data, $me['id']]);
        json_out(['ok' => true, 'iep' => iep_of($nr)]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
