<?php
/*
 * Lernzone – Google-Kalender (iCal) einlesen und mit den Trainings abgleichen
 *
 * Quelle: Einstellung „calendar_url“ (Admin, Trainer-Bereich → Trainer → Kalender).
 *   Erlaubt: Einbettungs-Link/iframe eines öffentlichen Google-Kalenders, öffentliche oder geheime iCal-Adresse (https).
 * Abruf höchstens alle 15 Minuten, Kopie in storage/calendar-cache.ics (bei Ausfall wird die letzte Kopie genutzt).
 * Jeder Termin im Zeitraum −30 bis +60 Tage wird in der Tabelle trainings angelegt bzw. aktualisiert (cal_key).
 * Unterstützt: ganztägige Termine, Zeitzonen, Wiederholungen (täglich, wöchentlich, monatlich, jährlich),
 *              Ausnahmen (EXDATE), einzeln verschobene oder abgesagte Wiederholungen (RECURRENCE-ID, STATUS:CANCELLED).
 * Wird nur von api/*.php eingebunden (nach config.php).
 */

const CAL_REFRESH  = 900;    // Sekunden zwischen zwei Abrufen
const CAL_PAST     = 30;     // Tage zurück
const CAL_FUTURE   = 60;     // Tage voraus
const CAL_TZ       = 'Europe/Berlin';

function cal_tz(): DateTimeZone { static $tz = null; return $tz ??= new DateTimeZone(CAL_TZ); }
function cal_cache_file(): string { return __DIR__ . '/../../storage/calendar-cache.ics'; }

function cal_setting(string $k): string {
    $st = db()->prepare('SELECT value FROM settings WHERE name = ?'); $st->execute([$k]);
    $v = $st->fetchColumn(); return $v === false ? '' : (string)$v;
}
function cal_set(string $k, string $v): void {
    db()->prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')->execute([$k, $v]);
}

/* Einbettungs-Link, iframe-Code oder iCal-Adresse → iCal-Adresse (oder null) */
function cal_normalize_url(string $in): ?string {
    $in = trim(html_entity_decode($in));
    if (preg_match('/src=["\']([^"\']+)["\']/i', $in, $m)) $in = $m[1];          // ganzer iframe-Code
    $in = preg_replace('#^webcal://#i', 'https://', $in);
    if (!preg_match('#^https://#i', $in)) return null;
    $p = parse_url($in);
    if (($p['host'] ?? '') === 'calendar.google.com' && str_contains($p['path'] ?? '', '/calendar/embed')) {
        parse_str($p['query'] ?? '', $q);
        $src = is_array($q['src'] ?? null) ? $q['src'][0] : ($q['src'] ?? '');
        if (!preg_match('/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/', $src)) return null;
        return 'https://calendar.google.com/calendar/ical/' . rawurlencode($src) . '/public/basic.ics';
    }
    return filter_var($in, FILTER_VALIDATE_URL) ? $in : null;
}

function cal_fetch(string $url): array {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        $opt = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_TIMEOUT => 10,
                CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Lernzone/1.0'];
        if (defined('CURLSSLOPT_NATIVE_CA')) $opt[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;   // Windows/XAMPP: Zertifikate des Systems
        curl_setopt_array($c, $opt);
        $body = curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $err = curl_error($c);
        curl_close($c);
        if ($body === false) return [false, '', 'Kalender nicht erreichbar: ' . $err];
        if ($code !== 200) return [false, '', $code === 404 || $code === 403 ? 'Kalender nicht gefunden oder nicht öffentlich (HTTP ' . $code . ').' : 'Kalender antwortet mit HTTP ' . $code . '.'];
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'Lernzone/1.0']]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) return [false, '', 'Kalender nicht erreichbar (PHP-Erweiterung curl oder openssl fehlt?).'];
    }
    if (!str_contains($body, 'BEGIN:VCALENDAR')) return [false, '', 'Unter dieser Adresse liegt kein Kalender im iCal-Format.'];
    return [true, $body, ''];
}

/* ---------- iCal lesen ---------- */

function cal_unescape(string $s): string { return strtr($s, ['\\n' => "\n", '\\N' => "\n", '\\,' => ',', '\;' => ';', '\\\\' => '\\']); }

function cal_parse(string $ics): array {
    $ics = str_replace(["\r\n", "\r"], "\n", $ics);
    $ics = preg_replace("/\n[ \t]/", '', $ics);        // umbrochene Zeilen wieder zusammenfügen
    $events = []; $cur = null; $depth = 0;
    foreach (explode("\n", $ics) as $line) {
        if ($line === 'BEGIN:VEVENT') { $cur = ['exdate' => []]; continue; }
        if ($line === 'END:VEVENT') { if ($cur && !empty($cur['uid']) && !empty($cur['dtstart'])) $events[] = $cur; $cur = null; continue; }
        if ($cur === null) continue;
        if (str_starts_with($line, 'BEGIN:')) { $depth++; continue; }     // z. B. VALARM überspringen
        if (str_starts_with($line, 'END:')) { $depth = max(0, $depth - 1); continue; }
        if ($depth > 0) continue;
        if (!preg_match('/^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/s', $line, $m)) continue;
        [$all, $name, $praw, $val] = $m;
        $params = [];
        foreach (array_filter(explode(';', $praw)) as $p) { [$k, $v] = array_pad(explode('=', $p, 2), 2, ''); $params[strtoupper($k)] = trim($v, '"'); }
        switch ($name) {
            case 'UID': $cur['uid'] = $val; break;
            case 'SUMMARY': $cur['summary'] = cal_unescape($val); break;
            case 'LOCATION': $cur['location'] = cal_unescape($val); break;
            case 'STATUS': $cur['status'] = strtoupper($val); break;
            case 'RRULE': $cur['rrule'] = $val; break;
            case 'DTSTART': $cur['dtstart'] = [$val, $params]; break;
            case 'DTEND': $cur['dtend'] = [$val, $params]; break;
            case 'RECURRENCE-ID': $cur['recid'] = [$val, $params]; break;
            case 'EXDATE': foreach (explode(',', $val) as $x) $cur['exdate'][] = [$x, $params]; break;
        }
    }
    return $events;
}

/* Datumswert → [DateTimeImmutable in Berlin, ganztägig?] */
function cal_dt(array $d): array {
    [$v, $p] = $d;
    if (($p['VALUE'] ?? '') === 'DATE' || preg_match('/^\d{8}$/', $v)) {
        $t = DateTimeImmutable::createFromFormat('!Ymd', substr($v, 0, 8), cal_tz());
        return [$t, true];
    }
    $tz = cal_tz();
    if (str_ends_with($v, 'Z')) { $tz = new DateTimeZone('UTC'); $v = substr($v, 0, -1); }
    elseif (!empty($p['TZID'])) { try { $tz = new DateTimeZone($p['TZID']); } catch (Exception $e) { $tz = cal_tz(); } }
    $t = DateTimeImmutable::createFromFormat('Ymd\THis', substr($v, 0, 15), $tz) ?: DateTimeImmutable::createFromFormat('Ymd\THi', substr($v, 0, 13), $tz);
    if (!$t) return [null, false];
    return [$t->setTimezone(cal_tz()), false];
}

/* Wiederholungen eines Termins im Zeitfenster aufzählen */
function cal_expand(array $ev, DateTimeImmutable $start, bool $allDay, DateTimeImmutable $from, DateTimeImmutable $to): array {
    if (empty($ev['rrule'])) return [$start];
    $r = [];
    foreach (explode(';', $ev['rrule']) as $part) { [$k, $v] = array_pad(explode('=', $part, 2), 2, ''); $r[strtoupper($k)] = $v; }
    $freq = $r['FREQ'] ?? ''; $iv = max(1, (int)($r['INTERVAL'] ?? 1)); $count = isset($r['COUNT']) ? (int)$r['COUNT'] : 0;
    $until = null;
    if (!empty($r['UNTIL'])) { [$until, $uAll] = cal_dt([$r['UNTIL'], []]); if ($until && $uAll) $until = $until->setTime(23, 59, 59); }
    $out = []; $n = 0; $guard = 0;
    $emit = function (DateTimeImmutable $t) use (&$out, &$n, $count, $until, $to, $from): bool {   // false = Ende
        if ($until && $t > $until) return false;
        if ($count && $n >= $count) return false;
        $n++;
        if ($t > $to) return false;
        if ($t >= $from->modify('-1 day')) $out[] = $t;
        return true;
    };
    if ($freq === 'WEEKLY') {
        $map = ['MO' => 1, 'TU' => 2, 'WE' => 3, 'TH' => 4, 'FR' => 5, 'SA' => 6, 'SU' => 7];
        $days = [];
        foreach (array_filter(explode(',', $r['BYDAY'] ?? '')) as $d) { $d = substr($d, -2); if (isset($map[$d])) $days[] = $map[$d]; }
        if (!$days) $days = [(int)$start->format('N')];
        sort($days);
        $week = $start->modify('-' . ((int)$start->format('N') - 1) . ' days');
        while ($guard++ < 3000) {
            foreach ($days as $d) {
                $t = $week->modify('+' . ($d - 1) . ' days');
                if ($t < $start) continue;
                if (!$emit($t)) break 2;
            }
            $week = $week->modify("+$iv weeks");
        }
    } elseif (in_array($freq, ['DAILY', 'MONTHLY', 'YEARLY'], true)) {
        $step = ['DAILY' => 'days', 'MONTHLY' => 'months', 'YEARLY' => 'years'][$freq];
        for ($i = 0; $guard++ < 3000; $i += $iv) {
            $t = $start->modify("+$i $step");
            if ($freq !== 'DAILY' && $t->format('d') !== $start->format('d')) continue;   // z. B. 31. im kurzen Monat
            if (!$emit($t)) break;
        }
    } else {
        return [$start];
    }
    $ex = [];
    foreach ($ev['exdate'] as $x) { [$t, $a] = cal_dt($x); if ($t) $ex[$a || $allDay ? $t->format('Ymd') : $t->format('YmdHi')] = true; }
    return array_values(array_filter($out, fn($t) => !isset($ex[$allDay ? $t->format('Ymd') : $t->format('YmdHi')])));
}

/* Art des Termins aus dem Titel (Stichwörter in data/team.json → calendar.types) */
function cal_kind(string $title): string {
    static $types = null;
    if ($types === null) {
        $team = json_decode((string)file_get_contents(__DIR__ . '/../../data/team.json'), true) ?: [];
        $types = $team['calendar']['types'] ?? [];
    }
    $t = mb_strtolower($title);
    foreach ($types as $ty) foreach ($ty['match'] ?? [] as $w) if ($w !== '' && str_contains($t, mb_strtolower($w))) return $ty['kind'];
    return 'termin';
}

/* Alle Termine im Fenster: [key => occurrence] */
function cal_occurrences(array $events, DateTimeImmutable $from, DateTimeImmutable $to): array {
    $occ = []; $overrides = [];
    foreach ($events as $ev) {
        [$start, $allDay] = cal_dt($ev['dtstart']);
        if (!$start) continue;
        $end = null;
        if (!empty($ev['dtend'])) [$end] = cal_dt($ev['dtend']);
        $dur = $end ? $end->getTimestamp() - $start->getTimestamp() : ($allDay ? 86400 : 5400);
        $base = ['title' => clean_text($ev['summary'] ?? 'Termin', 80), 'location' => clean_text($ev['location'] ?? '', 120), 'allDay' => $allDay];
        if (!empty($ev['recid'])) {                       // einzeln geänderte Wiederholung
            [$rid] = cal_dt($ev['recid']);
            if ($rid) $overrides[$ev['uid'] . '|' . $rid->format('YmdHi')] = ($ev['status'] ?? '') === 'CANCELLED' ? null
                : $base + ['start' => $start, 'end' => $start->modify("+$dur seconds")];
            continue;
        }
        if (($ev['status'] ?? '') === 'CANCELLED') continue;
        foreach (cal_expand($ev, $start, $allDay, $from, $to) as $t) {
            $key = empty($ev['rrule']) ? $ev['uid'] : $ev['uid'] . '|' . $t->format('YmdHi');
            $occ[$key] = $base + ['start' => $t, 'end' => $t->modify("+$dur seconds")];
        }
    }
    foreach ($overrides as $key => $o) {
        if ($o === null) { unset($occ[$key]); continue; }
        $occ[$key] = $o;
    }
    return array_filter($occ, fn($o) => $o['start'] <= $to && $o['end'] >= $from);
}

/* Termine in die Tabelle trainings übernehmen */
function cal_sync(array $occ, DateTimeImmutable $from, DateTimeImmutable $to): int {
    $sel = db()->prepare('SELECT id FROM trainings WHERE cal_key = ?');
    $upd = db()->prepare('UPDATE trainings SET date = ?, time = ?, end_time = ?, title = ?, kind = ?, location = ? WHERE id = ?');
    $ins = db()->prepare('INSERT INTO trainings (date, time, end_time, title, kind, location, note, cal_key) VALUES (?, ?, ?, ?, ?, ?, \'\', ?)');
    $own = db()->prepare("SELECT id FROM trainings WHERE cal_key = '' AND date = ? AND kind = 'training' ORDER BY id LIMIT 1");
    $adopt = db()->prepare('UPDATE trainings SET cal_key = ? WHERE id = ?');
    db()->beginTransaction();
    foreach ($occ as $key => $o) {
        $row = [$o['start']->format('Y-m-d'), $o['allDay'] ? '' : $o['start']->format('H:i'), $o['allDay'] ? '' : $o['end']->format('H:i'),
                $o['title'], cal_kind($o['title']), $o['location']];
        $sel->execute([$key]);
        $id = $sel->fetchColumn();
        if (!$id && $row[4] === 'training') {                  // gleiches Training schon von Hand / aus der Excel angelegt?
            $own->execute([$row[0]]);
            if ($id = $own->fetchColumn()) $adopt->execute([$key, $id]);
        }
        if ($id) $upd->execute([...$row, $id]); else $ins->execute([...$row, $key]);
    }
    // Termine, die aus dem Kalender verschwunden sind (ab heute): löschen, wenn noch nichts eingetragen ist
    $old = db()->prepare("SELECT id, cal_key FROM trainings WHERE cal_key != '' AND date >= ? AND date <= ?");
    $old->execute([today(), $to->format('Y-m-d')]);
    foreach ($old->fetchAll(PDO::FETCH_ASSOC) as $t) {
        if (isset($occ[$t['cal_key']])) continue;
        $used = db()->prepare('SELECT (SELECT COUNT(*) FROM attendance WHERE training_id = ?) + (SELECT COUNT(*) FROM moods WHERE training_id = ?)');
        $used->execute([$t['id'], $t['id']]);
        if ((int)$used->fetchColumn() === 0) {
            db()->prepare('DELETE FROM absences WHERE training_id = ?')->execute([$t['id']]);
            db()->prepare('DELETE FROM trainings WHERE id = ?')->execute([$t['id']]);
        }
    }
    db()->commit();
    return count($occ);
}

/* Bei Bedarf neu abrufen (höchstens alle 15 Minuten, $force = sofort) */
function calendar_refresh(bool $force = false): void {
    $url = cal_setting('calendar_url');
    if ($url === '') return;
    if (!$force && time() - (int)cal_setting('calendar_checked') < CAL_REFRESH) return;
    cal_set('calendar_checked', (string)time());
    [$ok, $body, $err] = cal_fetch($url);
    if ($ok) @file_put_contents(cal_cache_file(), $body);
    elseif (is_file(cal_cache_file())) $body = (string)file_get_contents(cal_cache_file());
    cal_set('calendar_error', $ok ? '' : rtrim($err, '. ') . ($body !== '' ? '. Angezeigt werden die zuletzt geladenen Termine.' : ''));
    if ($body === '') return;
    $now  = new DateTimeImmutable('now', cal_tz());
    $from = $now->setTime(0, 0)->modify('-' . CAL_PAST . ' days');
    $to   = $now->setTime(23, 59, 59)->modify('+' . CAL_FUTURE . ' days');
    try {
        $n = cal_sync(cal_occurrences(cal_parse($body), $from, $to), $from, $to);
        if ($ok) { cal_set('calendar_synced', date('d.m.Y H:i')); cal_set('calendar_count', (string)$n); }
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        cal_set('calendar_error', 'Kalender konnte nicht gelesen werden.');
    }
}

function calendar_status(): array {
    return ['configured' => cal_setting('calendar_url') !== '', 'synced' => cal_setting('calendar_synced'), 'season' => cal_setting('season_start'),
            'count' => (int)cal_setting('calendar_count'), 'error' => cal_setting('calendar_error')];
}
