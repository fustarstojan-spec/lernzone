<?php
/*
 * Gesprächsrunden mit Zeitfenstern (ab 0.38.0), z. B. Entwicklungsgespräche
 * mode "kind"   = Gespräch mit dem Kind: das Kind bucht, die Eltern sehen den Termin
 * mode "eltern" = Gespräch mit Eltern und Kind: die Eltern buchen, das Kind sieht den Termin
 * Der Trainer kann jedes Fenster selbst vergeben (z. B. Kind ohne Elternzugang). Buchen/Ändern bis TALK_HOURS vor Beginn.
 *
 * Trainer:
 *   GET → {ok, coach:true, rounds:[{id, title, mode, location, note, slots:[{id, date, time, minutes, nr, by}], invited:[nr], open:[nr]}]}
 *   POST {action:"create", title, mode, location, note, minutes, days:[{date, from, to}], nrs:[nr]}
 *   POST {action:"update", round, title, location, note}
 *   POST {action:"addslots", round, minutes, days:[…]} · {action:"delslot", slot} · {action:"assign", slot, nr (0 = frei)}
 *   POST {action:"invite", round, nrs:[nr]} · {action:"delete", round}
 * Kind / Eltern (nur das eigene Kind, andere Buchungen nur als „belegt“):
 *   GET → {ok, rounds:[{id, title, mode, location, note, canBook, mine:{id, date, time, minutes}|null, slots:[{id, date, time, minutes, free}]}]}
 *   POST {action:"book", slot} · {action:"cancel", round}
 */
require __DIR__ . '/config.php';
require_login();
const TALK_HOURS = 24;
const TALK_MAX_SLOTS = 80;
$coach  = current_coach();
$parent = $coach ? null : current_parent();
$user   = $coach || $parent ? null : current_user();
if (!$coach && !$parent && !$user) json_out(['ok' => false, 'error' => 'Bitte melde dich an.'], 401);
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
$q = function (string $sql, array $a = []): PDOStatement { $st = db()->prepare($sql); $st->execute($a); return $st; };
$start = fn(array $s) => strtotime($s['date'] . ' ' . $s['time']);
$slotOut = fn(array $s) => ['id' => (int)$s['id'], 'date' => $s['date'], 'time' => $s['time'], 'minutes' => (int)$s['minutes']];

/* ---------- Kind / Eltern ---------- */
if (!$coach) {
    $nr = $parent ? $parent['nr'] : $user['nr'];
    $who = $parent ? 'eltern' : 'kind';
    $mine = function () use ($q, $nr, $who, $slotOut, $start): array {
        $out = [];
        foreach ($q('SELECT r.* FROM talk_rounds r JOIN talk_invites i ON i.round_id = r.id AND i.nr = ? ORDER BY r.id DESC', [$nr])->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $slots = $q('SELECT * FROM talk_slots WHERE round_id = ? ORDER BY date, time', [$r['id']])->fetchAll(PDO::FETCH_ASSOC);
            $own = array_values(array_filter($slots, fn($s) => (int)$s['nr'] === $nr))[0] ?? null;
            if (!$own && !array_filter($slots, fn($s) => $start($s) > time())) continue;     // Runde vorbei
            if ($own && $start($own) + (int)$own['minutes'] * 60 < time() - 86400) continue;   // eigenes Gespräch ist vorbei
            $out[] = ['id' => (int)$r['id'], 'title' => $r['title'], 'mode' => $r['mode'], 'location' => $r['location'], 'note' => $r['note'],
                      'canBook' => $r['mode'] === $who, 'mine' => $own ? $slotOut($own) + ['locked' => $start($own) - TALK_HOURS * 3600 <= time()] : null,
                      'slots' => array_values(array_map(fn($s) => $slotOut($s) + ['free' => $s['nr'] === null], array_filter($slots, fn($s) => $start($s) - TALK_HOURS * 3600 > time())))];
        }
        return $out;
    };
    if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'rounds' => $mine(), 'hours' => TALK_HOURS]);
    require_method('POST');
    $in = json_in();
    $round = function (int $id) use ($q, $nr, $who, $fail): array {
        $r = $q('SELECT r.* FROM talk_rounds r JOIN talk_invites i ON i.round_id = r.id AND i.nr = ? WHERE r.id = ?', [$nr, $id])->fetch(PDO::FETCH_ASSOC) ?: $fail('Diese Gesprächsrunde gibt es nicht.', 404);
        if ($r['mode'] !== $who) $fail($r['mode'] === 'eltern' ? 'Den Termin für dieses Gespräch wählen die Eltern.' : 'Den Termin für dieses Gespräch wählt das Kind selbst.', 403);
        return $r;
    };
    $ownSlot = fn(int $rid) => $q('SELECT * FROM talk_slots WHERE round_id = ? AND nr = ?', [$rid, $nr])->fetch(PDO::FETCH_ASSOC) ?: null;
    $tooLate = fn(array $s) => $start($s) - TALK_HOURS * 3600 <= time();
    switch ($in['action'] ?? '') {
        case 'book':
            $s = $q('SELECT * FROM talk_slots WHERE id = ?', [(int)($in['slot'] ?? 0)])->fetch(PDO::FETCH_ASSOC) ?: $fail('Dieses Zeitfenster gibt es nicht.', 404);
            $r = $round((int)$s['round_id']);
            if ($tooLate($s)) $fail('Dieses Zeitfenster ist zu kurzfristig. Bitte direkt beim Trainer melden.');
            $old = $ownSlot((int)$r['id']);
            if ($old && (int)$old['id'] === (int)$s['id']) json_out(['ok' => true, 'rounds' => $mine(), 'hours' => TALK_HOURS]);
            if ($old && $tooLate($old)) $fail('Der gebuchte Termin ist in weniger als ' . TALK_HOURS . ' Stunden – ändern bitte direkt beim Trainer.');
            $up = db()->prepare("UPDATE talk_slots SET nr = ?, booked_by = ?, booked_at = ? WHERE id = ? AND nr IS NULL");
            $up->execute([$nr, $who, date('Y-m-d H:i'), (int)$s['id']]);
            if ($up->rowCount() !== 1) $fail('Dieses Zeitfenster wurde gerade vergeben. Bitte ein anderes wählen.', 409);
            if ($old) $q("UPDATE talk_slots SET nr = NULL, booked_by = '', booked_at = '' WHERE id = ?", [(int)$old['id']]);
            json_out(['ok' => true, 'rounds' => $mine(), 'hours' => TALK_HOURS]);
        case 'cancel':
            $r = $round((int)($in['round'] ?? 0));
            $old = $ownSlot((int)$r['id']);
            if ($old) {
                if ($tooLate($old)) $fail('Der Termin ist in weniger als ' . TALK_HOURS . ' Stunden – absagen bitte direkt beim Trainer.');
                $q("UPDATE talk_slots SET nr = NULL, booked_by = '', booked_at = '' WHERE id = ?", [(int)$old['id']]);
            }
            json_out(['ok' => true, 'rounds' => $mine(), 'hours' => TALK_HOURS]);
    }
    $fail('Unbekannte Aktion');
}

/* ---------- Trainer ---------- */
$all = function () use ($q): array {
    $out = [];
    foreach ($q('SELECT * FROM talk_rounds ORDER BY id DESC')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $slots = $q('SELECT * FROM talk_slots WHERE round_id = ? ORDER BY date, time', [$r['id']])->fetchAll(PDO::FETCH_ASSOC);
        $inv = array_map('intval', $q('SELECT i.nr FROM talk_invites i JOIN players p ON p.nr = i.nr AND p.active = 1 WHERE i.round_id = ? ORDER BY i.nr', [$r['id']])->fetchAll(PDO::FETCH_COLUMN));
        $booked = array_map('intval', array_filter(array_column($slots, 'nr'), fn($n) => $n !== null));
        $out[] = ['id' => (int)$r['id'], 'title' => $r['title'], 'mode' => $r['mode'], 'location' => $r['location'], 'note' => $r['note'],
                  'slots' => array_map(fn($s) => ['id' => (int)$s['id'], 'date' => $s['date'], 'time' => $s['time'], 'minutes' => (int)$s['minutes'],
                                                  'nr' => $s['nr'] === null ? null : (int)$s['nr'], 'by' => $s['booked_by']], $slots),
                  'invited' => $inv, 'open' => array_values(array_diff($inv, $booked))];
    }
    return $out;
};
if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'coach' => true, 'rounds' => $all(), 'hours' => TALK_HOURS]);
require_method('POST');
$in = json_in();
$done = fn() => json_out(['ok' => true, 'coach' => true, 'rounds' => $all(), 'hours' => TALK_HOURS]);
$roundRow = fn(int $id) => $q('SELECT * FROM talk_rounds WHERE id = ?', [$id])->fetch(PDO::FETCH_ASSOC) ?: $fail('Diese Gesprächsrunde gibt es nicht.', 404);
$minutes = fn($v) => in_array((int)$v, [10, 15, 20, 25, 30, 45, 60], true) ? (int)$v : 20;
/* Zeitfenster aus Tagen mit Von–Bis erzeugen (lückenlos hintereinander) */
$makeSlots = function (int $rid, array $days, int $min) use ($q, $fail): int {
    $n = 0; $exist = (int)$q('SELECT COUNT(*) FROM talk_slots WHERE round_id = ?', [$rid])->fetchColumn();
    $ins = db()->prepare('INSERT INTO talk_slots (round_id, date, time, minutes) VALUES (?, ?, ?, ?)');
    foreach ($days as $d) {
        $date = (string)($d['date'] ?? ''); $from = (string)($d['from'] ?? ''); $to = (string)($d['to'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $from) || !preg_match('/^\d{2}:\d{2}$/', $to)) $fail('Bitte Tag, Beginn und Ende angeben.');
        if ($date < today()) $fail('Der Tag liegt in der Vergangenheit.');
        $a = strtotime("$date $from"); $b = strtotime("$date $to");
        if ($b - $a < $min * 60) $fail("Am " . date('d.m.', $a) . " passt kein Zeitfenster von $min Min. zwischen Beginn und Ende.");
        for ($t = $a; $t + $min * 60 <= $b; $t += $min * 60) {
            if ($exist + ++$n > TALK_MAX_SLOTS) $fail('Höchstens ' . TALK_MAX_SLOTS . ' Zeitfenster pro Runde.');
            $ins->execute([$rid, $date, date('H:i', $t), $min]);
        }
    }
    return $n;
};
$invite = function (int $rid, array $nrs) use ($q): void {
    $q('DELETE FROM talk_invites WHERE round_id = ?', [$rid]);
    $ok = array_map('intval', $q('SELECT nr FROM players WHERE active = 1')->fetchAll(PDO::FETCH_COLUMN));
    $ins = db()->prepare('INSERT OR IGNORE INTO talk_invites (round_id, nr) VALUES (?, ?)');
    foreach ($nrs as $n) if (in_array((int)$n, $ok, true)) $ins->execute([$rid, (int)$n]);
};

switch ($in['action'] ?? '') {
    case 'create':
        $title = clean_text($in['title'] ?? '', 80);
        if ($title === '') $fail('Bitte einen Titel eingeben (z. B. Entwicklungsgespräche Herbst).');
        $mode = ($in['mode'] ?? '') === 'kind' ? 'kind' : 'eltern';
        $nrs = is_array($in['nrs'] ?? null) ? $in['nrs'] : [];
        if (!$nrs) $fail('Bitte mindestens ein Kind auswählen.');
        $days = is_array($in['days'] ?? null) ? $in['days'] : [];
        if (!$days) $fail('Bitte mindestens einen Tag mit Uhrzeit angeben.');
        db()->beginTransaction();
        $q('INSERT INTO talk_rounds (title, mode, location, note, created_by) VALUES (?, ?, ?, ?, ?)',
           [$title, $mode, clean_text($in['location'] ?? '', 120), clean_text($in['note'] ?? '', 300), $coach['id']]);
        $rid = (int)db()->lastInsertId();
        $makeSlots($rid, $days, $minutes($in['minutes'] ?? 20));
        $invite($rid, $nrs);
        db()->commit();
        $done();
    case 'update':
        $r = $roundRow((int)($in['round'] ?? 0));
        $title = clean_text($in['title'] ?? '', 80) ?: $r['title'];
        $q('UPDATE talk_rounds SET title = ?, location = ?, note = ? WHERE id = ?', [$title, clean_text($in['location'] ?? '', 120), clean_text($in['note'] ?? '', 300), $r['id']]);
        $done();
    case 'addslots':
        $r = $roundRow((int)($in['round'] ?? 0));
        $makeSlots((int)$r['id'], is_array($in['days'] ?? null) ? $in['days'] : [], $minutes($in['minutes'] ?? 20));
        $done();
    case 'delslot':
        $q('DELETE FROM talk_slots WHERE id = ?', [(int)($in['slot'] ?? 0)]);
        $done();
    case 'assign':
        $s = $q('SELECT * FROM talk_slots WHERE id = ?', [(int)($in['slot'] ?? 0)])->fetch(PDO::FETCH_ASSOC) ?: $fail('Dieses Zeitfenster gibt es nicht.', 404);
        $nr = (int)($in['nr'] ?? 0);
        if ($nr) {
            if (!$q('SELECT 1 FROM talk_invites WHERE round_id = ? AND nr = ?', [$s['round_id'], $nr])->fetchColumn()) $fail("Nr. $nr ist zu dieser Runde nicht eingeladen.");
            $q("UPDATE talk_slots SET nr = NULL, booked_by = '', booked_at = '' WHERE round_id = ? AND nr = ?", [$s['round_id'], $nr]);   // ein Termin pro Kind
            $q("UPDATE talk_slots SET nr = ?, booked_by = 'trainer', booked_at = ? WHERE id = ?", [$nr, date('Y-m-d H:i'), $s['id']]);
        } else $q("UPDATE talk_slots SET nr = NULL, booked_by = '', booked_at = '' WHERE id = ?", [$s['id']]);
        $done();
    case 'invite':
        $r = $roundRow((int)($in['round'] ?? 0));
        $invite((int)$r['id'], is_array($in['nrs'] ?? null) ? $in['nrs'] : []);
        $q('UPDATE talk_slots SET nr = NULL, booked_by = \'\', booked_at = \'\' WHERE round_id = ? AND nr IS NOT NULL AND nr NOT IN (SELECT nr FROM talk_invites WHERE round_id = ?)', [$r['id'], $r['id']]);
        $done();
    case 'delete':
        $r = $roundRow((int)($in['round'] ?? 0));
        foreach (['talk_slots', 'talk_invites'] as $t) $q("DELETE FROM $t WHERE round_id = ?", [$r['id']]);
        $q('DELETE FROM talk_rounds WHERE id = ?', [$r['id']]);
        $done();
}
$fail('Unbekannte Aktion');
