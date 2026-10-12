<?php
/*
 * Info für Eltern und Trainer (ab 0.39.0): Vereinsinfos, Ärzte und Therapeuten, Partner – pro Verein
 * GET → {ok, items:[{id, kind, grp, data, ad, draft, sort}], canEdit}   Eltern und Trainer (Kinder nicht); Entwürfe nur für Bearbeiter
 * POST (Cheftrainer / Vereinsadmin der gewählten Mannschaft):
 *   {action:"save", id?, kind:"text"|"partner", grp, data, ad, draft} · {action:"delete", id} · {action:"move", id, dir:-1|1}
 */
require __DIR__ . '/config.php';
require_login();
$coach = current_coach();
$parent = $coach ? null : current_parent();
if (!$coach && !$parent) json_out(['ok' => false, 'error' => 'Nur für Eltern und Trainer.'], 403);
$team = team_info();
if (!$team) json_out(['ok' => false, 'error' => 'Keine Mannschaft gewählt.'], 400);
$club = (int)$team['clubId'];
$edit = (bool)($coach['isAdmin'] ?? false);
$fail = fn(string $m, int $c = 400) => json_out(['ok' => false, 'error' => $m], $c);
const INFO_GROUPS = ['verein', 'arzt', 'therapie', 'partner'];

$items = function () use ($club, $edit): array {
    $st = pdb()->prepare('SELECT * FROM club_info WHERE club_id = ?' . ($edit ? '' : ' AND draft = 0') . ' ORDER BY grp, sort, id');
    $st->execute([$club]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'kind' => $r['kind'], 'grp' => $r['grp'], 'data' => json_decode($r['data'], true) ?: [],
                                'ad' => (bool)$r['ad'], 'draft' => (bool)$r['draft'], 'sort' => (int)$r['sort']], $st->fetchAll(PDO::FETCH_ASSOC));
};
if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'items' => $items(), 'canEdit' => $edit]);

require_method('POST');
if (!$edit) $fail('Info bearbeiten Cheftrainer und Vereinsadmins (Admin-Zone).', 403);
$in = json_in();
$row = function (int $id) use ($club, $fail): array {
    $st = pdb()->prepare('SELECT * FROM club_info WHERE id = ? AND club_id = ?'); $st->execute([$id, $club]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: $fail('Diesen Eintrag gibt es nicht.', 404);
};
switch ($in['action'] ?? '') {
    case 'save':
        $kind = ($in['kind'] ?? '') === 'text' ? 'text' : 'partner';
        $grp = in_array($in['grp'] ?? '', INFO_GROUPS, true) ? $in['grp'] : ($kind === 'text' ? 'verein' : 'arzt');
        $data = info_clean($kind, is_array($in['data'] ?? null) ? $in['data'] : [], $fail);
        $ad = $kind === 'partner' && !empty($in['ad']) ? 1 : 0;
        $draft = !empty($in['draft']) ? 1 : 0;
        $now = date('Y-m-d H:i');
        if (!empty($in['id'])) {
            $r = $row((int)$in['id']);
            pdb()->prepare('UPDATE club_info SET kind = ?, grp = ?, data = ?, ad = ?, draft = ?, updated_by = ?, updated_at = ? WHERE id = ?')
                ->execute([$kind, $grp, json_encode($data, JSON_UNESCAPED_UNICODE), $ad, $draft, $coach['id'], $now, $r['id']]);
        } else {
            $st = pdb()->prepare('SELECT COALESCE(MAX(sort), 0) + 1 FROM club_info WHERE club_id = ? AND grp = ?'); $st->execute([$club, $grp]);
            pdb()->prepare('INSERT INTO club_info (club_id, kind, grp, data, ad, draft, sort, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$club, $kind, $grp, json_encode($data, JSON_UNESCAPED_UNICODE), $ad, $draft, (int)$st->fetchColumn(), $coach['id'], $now]);
        }
        json_out(['ok' => true, 'items' => $items(), 'canEdit' => true]);
    case 'delete':
        $r = $row((int)($in['id'] ?? 0));
        pdb()->prepare('DELETE FROM club_info WHERE id = ?')->execute([$r['id']]);
        json_out(['ok' => true, 'items' => $items(), 'canEdit' => true]);
    case 'move':
        $r = $row((int)($in['id'] ?? 0));
        $st = pdb()->prepare('SELECT id, sort FROM club_info WHERE club_id = ? AND grp = ? ORDER BY sort, id'); $st->execute([$club, $r['grp']]);
        $list = $st->fetchAll(PDO::FETCH_ASSOC);
        $i = array_search((int)$r['id'], array_map('intval', array_column($list, 'id')), true);
        $j = $i + ((int)($in['dir'] ?? 0) < 0 ? -1 : 1);
        if ($i !== false && isset($list[$j])) { [$list[$i], $list[$j]] = [$list[$j], $list[$i]]; }
        $up = pdb()->prepare('UPDATE club_info SET sort = ? WHERE id = ?');
        foreach ($list as $k => $x) $up->execute([$k + 1, $x['id']]);
        json_out(['ok' => true, 'items' => $items(), 'canEdit' => true]);
}
$fail('Unbekannte Aktion');
