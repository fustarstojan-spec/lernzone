<?php
/*
 * Kalender (Google-Kalender über iCal)
 * GET                        → {ok, next, upcoming:[…14 Tage], status}        (angemeldet; Admin zusätzlich: url)
 * GET ?days=60               → upcoming über mehr Tage (max. 60)
 * POST {action:"seturl", url} → Kalender-Adresse speichern und sofort abrufen   (Admin; Einbettungs-Link, iframe-Code oder iCal-Adresse)
 * POST {action:"refresh"}     → sofort neu abrufen                               (Trainer)
 * Termin: {id, date, time, endTime, title, kind, location, note}
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib/calendar.php';
require_login();

$out = function (): never {
    $days = max(1, min(60, (int)($_GET['days'] ?? 14)));
    $st = db()->prepare('SELECT id, date, time, end_time, title, kind, location, note FROM trainings
                         WHERE date >= ? AND date <= ? ORDER BY date, time');
    $st->execute([today(), date('Y-m-d', strtotime("+$days days"))]);
    $now = date('H:i');
    $list = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
        // heute schon vorbei? (Ende, sonst Beginn + 90 Min.)
        if ($t['date'] === today() && $t['time'] !== '') {
            $end = $t['end_time'] !== '' ? $t['end_time'] : date('H:i', strtotime($t['time'] . ' +90 minutes'));
            if ($end < $now) continue;
        }
        $list[] = ['id' => (int)$t['id'], 'date' => $t['date'], 'time' => $t['time'], 'endTime' => $t['end_time'],
                   'title' => $t['title'] !== '' ? $t['title'] : 'Training', 'kind' => $t['kind'], 'location' => $t['location'], 'note' => $t['note']];
    }
    $c = current_coach();
    $status = calendar_status();
    if ($c && $c['isAdmin']) $status['url'] = cal_setting('calendar_url');
    json_out(['ok' => true, 'next' => $list[0] ?? null, 'upcoming' => $list, 'status' => $c ? $status : ['configured' => $status['configured']]]);
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') { calendar_refresh(); $out(); }

require_method('POST');
$me = require_coach();
$in = json_in();
switch ($in['action'] ?? '') {
    case 'seturl':
        if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
        $raw = trim((string)($in['url'] ?? ''));
        if ($raw === '') {                                    // Kalender trennen
            cal_set('calendar_url', ''); cal_set('calendar_error', ''); cal_set('calendar_synced', '');
            json_out(['ok' => true, 'status' => calendar_status() + ['url' => '']]);
        }
        $url = cal_normalize_url($raw);
        if (!$url) json_out(['ok' => false, 'error' => 'Das ist keine gültige Kalender-Adresse. Füge den Einbettungs-Link oder die iCal-Adresse ein (beginnt mit https://).'], 400);
        cal_set('calendar_url', $url);
        calendar_refresh(true);
        json_out(['ok' => true, 'status' => calendar_status() + ['url' => $url]]);
    case 'refresh':
        calendar_refresh(true);
        json_out(['ok' => true, 'status' => calendar_status() + ($me['isAdmin'] ? ['url' => cal_setting('calendar_url')] : [])]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
