<?php
/*
 * Trainer-Konten
 * GET                                   → [{id, name, isAdmin?}]  Namen für die Anmeldung (isAdmin nur für Trainer)
 * POST {action:"add", name, pin, isAdmin}          → neuer Trainer (nur Admin)
 * POST {action:"update", id, name?, pin?, isAdmin?} → ändern (Admin; eigener Name/PIN auch ohne Admin)
 * POST {action:"delete", id}                       → entfernen (nur Admin, nicht sich selbst, nicht den letzten Admin)
 */
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $me   = current_coach();
    $rows = db()->query('SELECT id, name, is_admin FROM coaches WHERE active = 1 ORDER BY is_admin DESC, name')->fetchAll(PDO::FETCH_ASSOC);
    json_out(array_map(fn($r) => $me
        ? ['id' => (int)$r['id'], 'name' => $r['name'], 'isAdmin' => (bool)$r['is_admin']]
        : ['id' => (int)$r['id'], 'name' => $r['name']], $rows));
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
    $pin  = (string)($in['pin'] ?? '');
    if ($name === '')                     json_out(['ok' => false, 'error' => 'Bitte einen Namen eingeben.'], 400);
    if (!preg_match('/^\d{6}$/', $pin))   json_out(['ok' => false, 'error' => 'Die Trainer-PIN muss 6 Ziffern haben.'], 400);
    db()->prepare('INSERT INTO coaches (name, pin_hash, is_admin) VALUES (?, ?, ?)')
        ->execute([$name, password_hash($pin, PASSWORD_DEFAULT), !empty($in['isAdmin']) ? 1 : 0]);
    json_out(['ok' => true, 'coach' => $coach((int)db()->lastInsertId())]);
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
    if (isset($in['pin']) && $in['pin'] !== '') {
        if (!preg_match('/^\d{6}$/', (string)$in['pin'])) json_out(['ok' => false, 'error' => 'Die Trainer-PIN muss 6 Ziffern haben.'], 400);
        db()->prepare('UPDATE coaches SET pin_hash = ?, fail_count = 0, locked_until = 0 WHERE id = ?')
            ->execute([password_hash((string)$in['pin'], PASSWORD_DEFAULT), $id]);
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
    json_out(['ok' => true]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
