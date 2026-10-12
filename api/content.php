<?php
/*
 * Eigene Lerninhalte des Vereins (ab 0.35.0) – Prinzipien, Phasentexte und Quizfragen, gepflegt in der App.
 * GET  (alle Angemeldeten)  → {ok, items:[{id, kind, target, data, draft, sort, updated, by}], canEdit, canDelete}
 *      Spieler bekommen keine Entwürfe.
 * POST {action:"save", id?, kind, target, data, draft}   (Cheftrainer / Vereinsadmin – ab 0.36.0 in der Admin-Zone)
 * POST {action:"move", id, dir:-1|1}                      (Cheftrainer / Vereinsadmin) Reihenfolge innerhalb von Art + Ziel
 * POST {action:"delete", id}                              (Cheftrainer / Vereinsadmin)
 * data je Art:
 *   principle: {title, text, cmd, sub, focus, pos:{TW:"…", RV:"…", …}, sketch:{items, lines}|null}
 *   quiz:      {q, options:[2–4], correct, why}
 *   text:      {ziel, intro, merk, keepQuiz}   (eine Zeile je Ziel; leere Felder = Standardtext)
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/lib/board.php';
require_login();
$team = team_info();
if (!$team) json_out(['ok' => false, 'error' => 'Keine Mannschaft gewählt.'], 400);
$club = (int)$team['clubId'];
$coach = current_coach();
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
const CONTENT_KINDS = ['principle', 'quiz', 'text'];
const POS_KEYS = ['TW', 'RV', 'IV', 'LV', '6', '8', 'RA', 'LA', 'ST'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $st = pdb()->prepare('SELECT k.*, c.name AS by_name FROM club_content k LEFT JOIN coaches c ON c.id = k.updated_by
                          WHERE k.club_id = ? AND k.active = 1' . ($coach ? '' : ' AND k.draft = 0') . ' ORDER BY k.target, k.kind, k.sort, k.id');
    $st->execute([$club]);
    $items = array_map(fn($r) => ['id' => (int)$r['id'], 'kind' => $r['kind'], 'target' => $r['target'], 'data' => json_decode($r['data'], true) ?: [],
        'draft' => (bool)$r['draft'], 'sort' => (int)$r['sort'], 'updated' => $coach ? $r['updated_at'] : '', 'by' => $coach ? (string)($r['by_name'] ?? '') : ''], $st->fetchAll(PDO::FETCH_ASSOC));
    json_out(['ok' => true, 'items' => $items, 'canEdit' => (bool)($coach['isAdmin'] ?? false), 'canDelete' => (bool)($coach['isAdmin'] ?? false)]);
}

require_method('POST');
if (!$coach || empty($coach['isAdmin'])) $fail('Inhalte bearbeiten Cheftrainer und Vereinsadmins (Admin-Zone).', 403);
$in = json_in(); $action = (string)($in['action'] ?? '');
$now = date('Y-m-d H:i');
$t = fn($v, int $n) => clean_text($v ?? '', $n);

if ($action === 'save') {
    $kind = (string)($in['kind'] ?? '');
    if (!in_array($kind, CONTENT_KINDS, true)) $fail('Unbekannte Art.');
    $target = preg_match('/^[a-z0-9_-]{1,20}$/i', (string)($in['target'] ?? '')) ? (string)$in['target'] : '';
    if ($target === '') $fail('Unbekanntes Ziel.');
    $d = is_array($in['data'] ?? null) ? $in['data'] : [];
    if ($kind === 'principle') {
        $pos = [];
        foreach (POS_KEYS as $k) { $v = $t($d['pos'][$k] ?? '', 300); if ($v !== '') $pos[$k] = $v; }
        $data = ['title' => $t($d['title'] ?? '', 80), 'text' => $t($d['text'] ?? '', 1500), 'cmd' => $t($d['cmd'] ?? '', 60),
                 'sub' => $t($d['sub'] ?? '', 60), 'focus' => preg_match('/^[A-D][1-3](\.\d)?$/', (string)($d['focus'] ?? '')) ? $d['focus'] : '',
                 'pos' => (object)$pos, 'sketch' => is_array($d['sketch'] ?? null) ? board_clean($d['sketch']) : null];
        if ($data['title'] === '') $fail('Bitte ein Schlagwort eingeben.');
    } elseif ($kind === 'quiz') {
        $opts = array_values(array_filter(array_map(fn($o) => $t($o, 200), array_slice(is_array($d['options'] ?? null) ? $d['options'] : [], 0, 4)), fn($o) => $o !== ''));
        $q = $t($d['q'] ?? '', 300); $c = (int)($d['correct'] ?? -1);
        if ($q === '') $fail('Bitte eine Frage eingeben.');
        if (count($opts) < 2) $fail('Bitte mindestens zwei Antworten eingeben.');
        if ($c < 0 || $c >= count($opts)) $fail('Bitte die richtige Antwort markieren.');
        $data = ['q' => $q, 'options' => $opts, 'correct' => $c, 'why' => $t($d['why'] ?? '', 500)];
    } else {
        $data = ['ziel' => $t($d['ziel'] ?? '', 300), 'intro' => $t($d['intro'] ?? '', 800), 'merk' => $t($d['merk'] ?? '', 200), 'keepQuiz' => !isset($d['keepQuiz']) || !empty($d['keepQuiz'])];
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE); $draft = !empty($in['draft']) && $kind !== 'text' ? 1 : 0;
    $id = (int)($in['id'] ?? 0);
    if ($kind === 'text' && !$id) {   // Texte: eine Zeile je Ziel
        $st = pdb()->prepare("SELECT id FROM club_content WHERE club_id = ? AND kind = 'text' AND target = ? AND active = 1"); $st->execute([$club, $target]);
        $id = (int)$st->fetchColumn();
    }
    if ($id) {
        $st = pdb()->prepare('UPDATE club_content SET data = ?, draft = ?, target = ?, updated_by = ?, updated_at = ? WHERE id = ? AND club_id = ? AND kind = ? AND active = 1');
        $st->execute([$json, $draft, $target, $coach['id'], $now, $id, $club, $kind]);
        if (!$st->rowCount()) $fail('Diesen Eintrag gibt es nicht.', 404);
    } else {
        $st = pdb()->prepare('SELECT COALESCE(MAX(sort), 0) + 1 FROM club_content WHERE club_id = ? AND kind = ? AND target = ?'); $st->execute([$club, $kind, $target]);
        pdb()->prepare('INSERT INTO club_content (club_id, kind, target, data, draft, sort, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$club, $kind, $target, $json, $draft, (int)$st->fetchColumn(), $coach['id'], $now]);
        $id = (int)pdb()->lastInsertId();
    }
    json_out(['ok' => true, 'id' => $id]);
}
if ($action === 'move') {
    $st = pdb()->prepare('SELECT * FROM club_content WHERE id = ? AND club_id = ? AND active = 1'); $st->execute([(int)($in['id'] ?? 0), $club]);
    $a = $st->fetch(PDO::FETCH_ASSOC); if (!$a) $fail('Diesen Eintrag gibt es nicht.', 404);
    $st = pdb()->prepare('SELECT id, sort FROM club_content WHERE club_id = ? AND kind = ? AND target = ? AND active = 1 ORDER BY sort, id'); $st->execute([$club, $a['kind'], $a['target']]);
    $list = $st->fetchAll(PDO::FETCH_ASSOC); $i = array_search((int)$a['id'], array_map('intval', array_column($list, 'id')), true);
    $j = $i + ((int)($in['dir'] ?? 0) < 0 ? -1 : 1);
    if ($i !== false && isset($list[$j])) { [$list[$i], $list[$j]] = [$list[$j], $list[$i]]; }
    $up = pdb()->prepare('UPDATE club_content SET sort = ? WHERE id = ?');
    foreach ($list as $k => $r) $up->execute([$k + 1, $r['id']]);
    json_out(['ok' => true]);
}
if ($action === 'delete') {
    if (!$coach['isAdmin']) $fail('Löschen dürfen Cheftrainer und Vereinsadmins.', 403);
    pdb()->prepare('UPDATE club_content SET active = 0, updated_by = ?, updated_at = ? WHERE id = ? AND club_id = ?')->execute([$coach['id'], $now, (int)($in['id'] ?? 0), $club]);
    json_out(['ok' => true]);
}
$fail('Unbekannte Aktion');
