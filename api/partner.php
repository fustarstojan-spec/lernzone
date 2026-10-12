<?php
/*
 * „Partner werden“ (ab 0.39.0): Praxen und Firmen fragen beim Verein an, ob sie im Info-Bereich für Eltern erscheinen können.
 * Öffentlich (ohne Anmeldung):
 *   POST {action:"request", club, praxis, fachrichtung, ansprechpartner, email, telefon, adresse, url, nachricht, privacy:true, website:""}
 *        website = Falle für Spam-Programme (muss leer bleiben). Bremse pro Netz wie bei der Anmeldung.
 * Cheftrainer / Vereinsadmin (gewählte Mannschaft → ihr Verein):
 *   GET → {ok, requests:[{id, data, status, created}]}
 *   POST {action:"status", id, status:"neu"|"erledigt"|"abgelehnt"} · {action:"delete", id}
 *   POST {action:"adopt", id, grp} → Entwurf im Info-Bereich anlegen (danach prüfen und freigeben)
 * Anfragen werden nach 180 Tagen gelöscht.
 */
require __DIR__ . '/config.php';
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m, 'csrf' => csrf_token()], $c);
pdb()->exec("DELETE FROM partner_requests WHERE created_at < datetime('now', '-180 days')");
$in = $_SERVER['REQUEST_METHOD'] === 'POST' ? json_in() : [];

if (($in['action'] ?? '') === 'request') {
    if (ip_blocked()) $fail('Zu viele Anfragen von diesem Netz. Bitte später noch einmal.', 429);
    ip_fail();                                                     // jede Anfrage zählt für die Bremse pro Netz
    if (trim((string)($in['website'] ?? '')) !== '') json_out(['ok' => true, 'csrf' => csrf_token()]);   // Spam: so tun, als ob
    $st = pdb()->prepare('SELECT id, name FROM clubs WHERE id = ? AND active = 1'); $st->execute([(int)($in['club'] ?? 0)]);
    $club = $st->fetch(PDO::FETCH_ASSOC) ?: $fail('Bitte einen Verein wählen.');
    $t = fn(string $k, int $n) => clean_text($in[$k] ?? '', $n);
    $d = ['praxis' => $t('praxis', 100), 'fachrichtung' => $t('fachrichtung', 80), 'ansprechpartner' => $t('ansprechpartner', 80),
          'email' => trim(mb_substr((string)($in['email'] ?? ''), 0, 120)), 'telefon' => $t('telefon', 30), 'adresse' => $t('adresse', 200),
          'url' => trim(mb_substr((string)($in['url'] ?? ''), 0, 200)), 'nachricht' => mb_substr(trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)($in['nachricht'] ?? ''))), 0, 1000)];
    if ($d['praxis'] === '' || $d['ansprechpartner'] === '') $fail('Bitte Praxis bzw. Firma und Ansprechpartner angeben.');
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $fail('Bitte eine gültige E-Mail-Adresse angeben.');
    if ($d['url'] !== '' && !preg_match('#^https?://[^\s<>"]+$#i', $d['url'])) $fail('Webseite bitte mit https:// angeben.');
    if (empty($in['privacy'])) $fail('Bitte der Verarbeitung Ihrer Angaben zustimmen.');
    $st = pdb()->prepare("SELECT COUNT(*) FROM partner_requests WHERE club_id = ? AND created_at > datetime('now', '-1 day')"); $st->execute([$club['id']]);
    if ((int)$st->fetchColumn() >= 30) $fail('Heute sind schon viele Anfragen eingegangen. Bitte morgen noch einmal.', 429);
    pdb()->prepare('INSERT INTO partner_requests (club_id, data) VALUES (?, ?)')->execute([$club['id'], json_encode($d, JSON_UNESCAPED_UNICODE)]);
    sec_log('partner_request', 'info', null, '', "Anfrage „Partner werden“ für {$club['name']}: {$d['praxis']}");
    json_out(['ok' => true, 'csrf' => csrf_token()]);
}

/* ---------- Verwaltung ---------- */
require_login();
$coach = current_coach();
if (!$coach || empty($coach['isAdmin'])) $fail('Nur für Cheftrainer und Vereinsadmins.', 403);
$club = (int)team_info()['clubId'];
$list = function () use ($club): array {
    $st = pdb()->prepare('SELECT * FROM partner_requests WHERE club_id = ? ORDER BY status = \'neu\' DESC, id DESC'); $st->execute([$club]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'data' => json_decode($r['data'], true) ?: [], 'status' => $r['status'],
                                'created' => date('d.m.Y H:i', strtotime($r['created_at'] . ' UTC'))], $st->fetchAll(PDO::FETCH_ASSOC));
};
if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'requests' => $list()]);
require_method('POST');
$row = function (int $id) use ($club, $fail): array {
    $st = pdb()->prepare('SELECT * FROM partner_requests WHERE id = ? AND club_id = ?'); $st->execute([$id, $club]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: $fail('Diese Anfrage gibt es nicht.', 404);
};
switch ($in['action'] ?? '') {
    case 'status':
        $r = $row((int)($in['id'] ?? 0));
        $s = in_array($in['status'] ?? '', ['neu', 'erledigt', 'abgelehnt'], true) ? $in['status'] : 'neu';
        pdb()->prepare('UPDATE partner_requests SET status = ? WHERE id = ?')->execute([$s, $r['id']]);
        json_out(['ok' => true, 'requests' => $list()]);
    case 'delete':
        $r = $row((int)($in['id'] ?? 0));
        pdb()->prepare('DELETE FROM partner_requests WHERE id = ?')->execute([$r['id']]);
        json_out(['ok' => true, 'requests' => $list()]);
    case 'adopt':
        $r = $row((int)($in['id'] ?? 0));
        $d = json_decode($r['data'], true) ?: [];
        $grp = in_array($in['grp'] ?? '', ['arzt', 'therapie', 'partner'], true) ? $in['grp'] : 'arzt';
        $url = preg_match('#^https://#i', (string)($d['url'] ?? '')) ? $d['url'] : '';
        $data = info_clean('partner', ['name' => $d['praxis'] ?? '', 'specialty' => $d['fachrichtung'] ?? '', 'address' => $d['adresse'] ?? '',
                                       'phone' => preg_match('#^[0-9 +()/\-]{4,30}$#', (string)($d['telefon'] ?? '')) ? $d['telefon'] : '', 'email' => $d['email'] ?? '', 'url' => $url, 'text' => ''], $fail);
        $st = pdb()->prepare('SELECT COALESCE(MAX(sort), 0) + 1 FROM club_info WHERE club_id = ? AND grp = ?'); $st->execute([$club, $grp]);
        pdb()->prepare('INSERT INTO club_info (club_id, kind, grp, data, ad, draft, sort, updated_by, updated_at) VALUES (?, \'partner\', ?, ?, 1, 1, ?, ?, ?)')
            ->execute([$club, $grp, json_encode($data, JSON_UNESCAPED_UNICODE), (int)$st->fetchColumn(), $coach['id'], date('Y-m-d H:i')]);
        pdb()->prepare("UPDATE partner_requests SET status = 'erledigt' WHERE id = ?")->execute([$r['id']]);
        json_out(['ok' => true, 'requests' => $list(), 'infoId' => (int)pdb()->lastInsertId()]);
}
$fail('Unbekannte Aktion');
