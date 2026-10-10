<?php
/*
 * Trainer-Wissen (ab 0.27.0, nur Trainer): Seiten pro Altersstufe und Materialbibliothek des Vereins
 * GET                       → {ok, pages:[…], links:[…], canDelete}
 * POST {action:"save", id?, kind, stage, category, phase, title, body, url, source, draft}
 * POST {action:"delete", id}   (Cheftrainer / Vereinsadmin)
 * Links zeigen auf externe Quellen (z. B. Google Drive des Trainers); Dateien werden nicht kopiert.
 */
require __DIR__ . '/config.php';
$me   = require_coach();
$club = (int)team_info()['clubId'];

const STAGES = ['grundlagen', 'aufbau', 'leistung', 'alle'];
$out = fn(array $k) => ['id' => (int)$k['id'], 'kind' => $k['kind'], 'stage' => $k['stage'], 'category' => $k['category'], 'phase' => $k['phase'],
    'title' => $k['title'], 'body' => $k['body'], 'url' => $k['url'], 'source' => $k['source'], 'draft' => (bool)$k['draft'],
    'updated' => $k['updated_at'], 'by' => (string)($k['by_name'] ?? '')];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $st = pdb()->prepare('SELECT k.*, c.name AS by_name FROM knowledge k LEFT JOIN coaches c ON c.id = k.updated_by
                          WHERE k.club_id = ? AND k.active = 1 ORDER BY k.sort, k.title');
    $st->execute([$club]);
    $all = array_map($out, $st->fetchAll(PDO::FETCH_ASSOC));
    json_out(['ok' => true, 'canDelete' => (bool)$me['isAdmin'],
              'pages' => array_values(array_filter($all, fn($k) => $k['kind'] === 'page')),
              'links' => array_values(array_filter($all, fn($k) => $k['kind'] === 'link'))]);
}

require_method('POST');
$in = json_in();
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
$now = date('Y-m-d H:i');

if (($in['action'] ?? '') === 'save') {
    $kind  = ($in['kind'] ?? '') === 'page' ? 'page' : 'link';
    $title = clean_text($in['title'] ?? '', 120);
    if ($title === '') $fail('Bitte einen Titel eingeben.');
    $url = trim((string)($in['url'] ?? ''));
    if ($kind === 'link' && !preg_match('#^https://[^\s<>"]{4,500}$#', $url)) $fail('Bitte eine gültige https-Adresse eingeben.');
    $vals = ['kind' => $kind, 'stage' => in_array($in['stage'] ?? '', STAGES, true) ? $in['stage'] : 'alle',
             'category' => clean_text($in['category'] ?? '', 40), 'phase' => preg_match('/^[A-D][1-3]$/', (string)($in['phase'] ?? '')) ? $in['phase'] : '',
             'title' => $title, 'body' => mb_substr(clean_text($in['body'] ?? '', 20000), 0, 20000), 'url' => $kind === 'link' ? $url : '',
             'source' => clean_text($in['source'] ?? '', 120), 'draft' => !empty($in['draft']) ? 1 : 0];
    $id = (int)($in['id'] ?? 0);
    if ($id) {
        $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($vals)));
        $st = pdb()->prepare("UPDATE knowledge SET $set, updated_by = :by, updated_at = :at WHERE id = :id AND club_id = :club");
        $st->execute($vals + ['by' => $me['id'], 'at' => $now, 'id' => $id, 'club' => $club]);
        if (!$st->rowCount()) $fail('Diesen Eintrag gibt es nicht.', 404);
    } else {
        $cols = implode(', ', array_keys($vals)); $ph = ':' . implode(', :', array_keys($vals));
        pdb()->prepare("INSERT INTO knowledge (club_id, $cols, updated_by, updated_at) VALUES (:club, $ph, :by, :at)")->execute($vals + ['club' => $club, 'by' => $me['id'], 'at' => $now]);
        $id = (int)pdb()->lastInsertId();
    }
    json_out(['ok' => true, 'id' => $id]);
}
if (($in['action'] ?? '') === 'delete') {
    if (!$me['isAdmin']) $fail('Löschen dürfen Cheftrainer und Vereinsadmins.', 403);
    pdb()->prepare('UPDATE knowledge SET active = 0, updated_by = ?, updated_at = ? WHERE id = ? AND club_id = ?')->execute([$me['id'], $now, (int)($in['id'] ?? 0), $club]);
    json_out(['ok' => true]);
}
$fail('Unbekannte Aktion');
