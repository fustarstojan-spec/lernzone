<?php
/*
 * Trainer der gewählten Mannschaft (ab 0.21.0 über Mitgliedschaften)
 * GET                                    → [{id, name, isAdmin, username}]  (nur Trainer)
 * POST {action:"add", name, username?, isAdmin}     → neuer Trainer in dieser Mannschaft (nur Admin) → {coach, username, code}
 *        Gibt es den Benutzernamen schon als Trainer-Konto, wird dieser Trainer nur hinzugefügt (kein neuer Code).
 * POST {action:"update", id, name?, isAdmin?}       → ändern (Admin; eigener Name auch ohne Admin). isAdmin gilt für diese Mannschaft.
 * POST {action:"delete", id}                       → aus dieser Mannschaft entfernen (nur Admin, nicht sich selbst, nicht den letzten Admin)
 */
require __DIR__ . '/config.php';

$list = function (): array {
    $st = pdb()->prepare("SELECT c.id, c.name, m.is_admin, a.username FROM memberships m JOIN coaches c ON c.id = m.ref AND c.active = 1
                          JOIN accounts a ON a.id = m.account_id WHERE m.team_id = ? AND m.role = 'coach' ORDER BY m.is_admin DESC, c.name");
    $st->execute([team_id()]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'isAdmin' => (bool)$r['is_admin'], 'username' => $r['username']],
                     $st->fetchAll(PDO::FETCH_ASSOC));
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') { require_coach(); json_out($list()); }

require_method('POST');
$me     = require_coach();
$in     = json_in();
$action = (string)($in['action'] ?? '');

$admins = fn() => count(array_filter($list(), fn($c) => $c['isAdmin']));
$coach  = fn(int $id) => array_values(array_filter($list(), fn($c) => $c['id'] === $id))[0] ?? null;

if ($action === 'add') {
    if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    $u = clean_username((string)($in['username'] ?? ''));
    // Bestehenden Trainer (z. B. aus einer anderen Mannschaft) hinzufügen
    if ($u !== '') {
        $st = pdb()->prepare("SELECT * FROM accounts WHERE username = ? AND kind = 'coach'"); $st->execute([$u]);
        if ($a = $st->fetch(PDO::FETCH_ASSOC)) {
            if ($coach((int)$a['ref'])) json_out(['ok' => false, 'error' => 'Dieser Trainer ist schon in der Mannschaft.'], 409);
            pdb()->prepare("INSERT INTO memberships (account_id, team_id, role, ref, is_admin) VALUES (?, ?, 'coach', ?, ?)")
                ->execute([$a['id'], team_id(), $a['ref'], !empty($in['isAdmin']) ? 1 : 0]);
            json_out(['ok' => true, 'coach' => $coach((int)$a['ref']), 'username' => $u, 'code' => null, 'existing' => true]);
        }
    }
    $name = clean_text($in['name'] ?? '', 30);
    if ($name === '') json_out(['ok' => false, 'error' => 'Bitte einen Namen eingeben.'], 400);
    if ($u === '') $u = unique_username(pdb(), username_ok(clean_username($name)) ? clean_username($name) : 'trainer');
    if (!username_ok($u))   json_out(['ok' => false, 'error' => 'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Bindestrich.'], 400);
    if (username_taken($u)) json_out(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.'], 409);
    $cid = create_coach($name);
    $aid = create_account($u, 'coach', $cid, !empty($in['isAdmin']));
    $code = issue_code($aid);
    json_out(['ok' => true, 'coach' => $coach($cid), 'username' => $u, 'code' => $code, 'expires' => date('d.m.Y H:i', time() + CODE_HOURS * 3600)]);
}

$id     = (int)($in['id'] ?? 0);
$target = $coach($id);
if (!$target) json_out(['ok' => false, 'error' => 'Diesen Trainer gibt es in dieser Mannschaft nicht.'], 404);
$acc = account_for('coach', $id);

if ($action === 'update') {
    $self = $id === $me['id'];
    if (!$self && !$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    if (array_key_exists('name', $in)) {
        $name = clean_text($in['name'], 30);
        if ($name === '') json_out(['ok' => false, 'error' => 'Der Name darf nicht leer sein.'], 400);
        pdb()->prepare('UPDATE coaches SET name = ? WHERE id = ?')->execute([$name, $id]);
    }
    if (array_key_exists('isAdmin', $in)) {
        if (!$me['isAdmin']) json_out(['ok' => false, 'error' => 'Nur Cheftrainer bestimmen Cheftrainer.'], 403);
        $make = !empty($in['isAdmin']);
        if (!$make && $target['isAdmin'] && $admins() <= 1) json_out(['ok' => false, 'error' => 'Es muss mindestens einen Cheftrainer geben.'], 400);
        pdb()->prepare('UPDATE memberships SET is_admin = ? WHERE account_id = ? AND team_id = ?')->execute([$make ? 1 : 0, $acc['id'], team_id()]);
    }
    json_out(['ok' => true, 'coach' => $coach($id), 'me' => coach_state()]);
}

if ($action === 'delete') {
    if (!$me['isAdmin'])                        json_out(['ok' => false, 'error' => 'Nur für Admins.'], 403);
    if ($id === $me['id'])                      json_out(['ok' => false, 'error' => 'Du kannst dich nicht selbst entfernen.'], 400);
    if ($target['isAdmin'] && $admins() <= 1)   json_out(['ok' => false, 'error' => 'Es muss mindestens einen Cheftrainer geben.'], 400);
    remove_membership((int)$acc['id']);
    $st = pdb()->prepare('SELECT COUNT(*) FROM accounts WHERE kind = ? AND ref = ?'); $st->execute(['coach', $id]);
    if ((int)$st->fetchColumn() === 0) pdb()->prepare('DELETE FROM coaches WHERE id = ?')->execute([$id]);   // nirgends mehr dabei
    json_out(['ok' => true]);
}

json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
