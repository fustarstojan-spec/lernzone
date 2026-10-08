<?php
/*
 * Trainer-Konten
 * GET                                    → [{id, name, isAdmin, username}]  (nur Trainer)
 * POST {action:"add", name, username?, isAdmin}     → neuer Trainer (nur Admin) → {coach, username, code}
 * POST {action:"update", id, name?, isAdmin?}       → ändern (Admin; eigener Name auch ohne Admin)
 * POST {action:"delete", id}                       → entfernen (nur Admin, nicht sich selbst, nicht den letzten Admin)
 */
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_coach();
    $rows = db()->query('SELECT id, name, is_admin FROM coaches WHERE active = 1 ORDER BY is_admin DESC, name')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'isAdmin' => (bool)$r['is_admin'],
                                  'username' => account_for('coach', (int)$r['id'])['username'] ?? ''], $rows));
}

require_method('POST');
$me     = require_coach();
$in     = json_in();
$action = (string)($in['action'] ?? '');

$admins = fn() => (int)db()->query('SELECT COUNT(*) FROM coaches WHERE active = 1 AND is_admin = 1')->fetchColumn();
$coach  = function (int $id) {
    $st = db()->prepare('SELECT id, name, is_admin FROM coaches WHERE id = ? AND active = 1');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ? ['id' => (int)$r['id'], 'name' => $r['name'], 'isAdmin' => (bool)$r['is_admin']] : null;
};

if ($action === 'add') {
    if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    $name = clean_text($in['name'] ?? '', 30);
    if ($name === '') json_out(['ok' => false, 'error' => 'Bitte einen Namen eingeben.'], 400);
    $u = clean_username((string)($in['username'] ?? ''));
    if ($u === '') $u = unique_username(db(), username_ok(clean_username($name)) ? clean_username($name) : 'trainer');
    if (!username_ok($u))   json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
    if (username_taken($u)) json_out(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.'], 409);
    db()->prepare("INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, '', ?)")->execute([$name, !empty($in['isAdmin']) ? 1 : 0]);
    $cid = (int)db()->lastInsertId();
    db()->prepare("INSERT INTO accounts (username, kind, ref, must_set_pw) VALUES (?, 'coach', ?, 1)")->execute([$u, $cid]);
    $code = issue_code((int)account_for('coach', $cid)['id']);
    json_out(['ok' => true, 'coach' => $coach($cid), 'username' => $u, 'code' => $code, 'expires' => date('d.m.Y', time() + CODE_DAYS * 86400)]);
}

$id     = (int)($in['id'] ?? 0);
$target = $coach($id);
if (!$target) json_out(['ok' => false, 'error' => 'Diesen Trainer gibt es nicht.'], 404);

if ($action === 'update') {
    $self = $id === $me['id'];
    if (!$self && !$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    if (array_key_exists('name', $in)) {
        $name = clean_text($in['name'], 30);
        if ($name === '') json_out(['ok' => false, 'error' => 'Der Name darf nicht leer sein.'], 400);
        db()->prepare('UPDATE coaches SET name = ? WHERE id = ?')->execute([$name, $id]);
    }
    if (array_key_exists('isAdmin', $in)) {
        if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur Admins vergeben Admin-Rechte.'], 403);
        $make = !empty($in['isAdmin']);
        if (!$make && $target['isAdmin'] && $admins() <= 1) json_out(['ok' => false, 'error' => 'Es muss mindestens einen Admin geben.'], 400);
        db()->prepare('UPDATE coaches SET is_admin = ? WHERE id = ?')->execute([$make ? 1 : 0, $id]);
    }
    json_out(['ok' => true, 'coach' => $coach($id), 'me' => coach_state()]);
}

if ($action === 'delete') {
    if (!$me['isAdmin'])                        json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    if ($id === $me['id'])                      json_out(['ok' => false, 'error' => 'Du kannst dich nicht selbst entfernen.'], 400);
    if ($target['isAdmin'] && $admins() <= 1)   json_out(['ok' => false, 'error' => 'Es muss mindestens einen Admin geben.'], 400);
    db()->prepare('DELETE FROM coaches WHERE id = ?')->execute([$id]);
    db()->prepare("DELETE FROM accounts WHERE kind = 'coach' AND ref = ?")->execute([$id]);
    json_out(['ok' => true]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
