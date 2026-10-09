<?php
/*
 * Rechtliches (ab 0.23.0): Angaben für Impressum und Datenschutzerklärung – öffentlich lesbar (auch ohne Anmeldung)
 * GET → {ok, operator:{name, street, city, email, phone, host, logs}, clubs:[{id, name, legalName, address, email, dpo}], myClub, updated}
 * POST {action:"operator", …}  → Betreiber-Angaben (nur Superadmin)
 * POST {action:"club", club, legalName, address, email, dpo} → Verantwortlicher des Vereins (Vereinsadmin oder Superadmin)
 * Die Angaben stehen nur in der Datenbank, nicht im Repository.
 */
require __DIR__ . '/config.php';

const OPERATOR_KEYS = ['name' => 60, 'street' => 80, 'city' => 60, 'email' => 80, 'phone' => 40, 'host' => 200, 'logs' => 300];
$set = function (string $k, ?string $v = null) {
    if ($v === null) { $st = pdb()->prepare('SELECT value FROM platform_settings WHERE name = ?'); $st->execute([$k]); return (string)($st->fetchColumn() ?: ''); }
    pdb()->prepare('INSERT INTO platform_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')->execute([$k, $v]);
    return $v;
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $op = [];
    foreach (OPERATOR_KEYS as $k => $_) $op[$k] = $set("legal_$k");
    $clubs = pdb()->query('SELECT id, name, legal_name, address, privacy_email, dpo FROM clubs WHERE active = 1 ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
    json_out(['ok' => true, 'operator' => $op, 'updated' => $set('legal_updated'), 'myClub' => team_info()['clubId'] ?? null,
        'clubs' => array_map(fn($c) => ['id' => (int)$c['id'], 'name' => $c['name'], 'legalName' => $c['legal_name'], 'address' => $c['address'],
                                        'email' => $c['privacy_email'], 'dpo' => $c['dpo']], $clubs)]);
}

require_method('POST');
require_login();
$acc = current_account();
$in  = json_in();
$email = fn($v) => ($v = clean_text($v, 80)) === '' || filter_var($v, FILTER_VALIDATE_EMAIL) ? $v : json_out(['ok' => false, 'error' => 'Bitte eine gültige E-Mail-Adresse eingeben.'], 400);

if (($in['action'] ?? '') === 'operator') {
    if (empty($acc['platform_admin'])) json_out(['ok' => false, 'error' => 'Nur für den Superadmin.'], 403);
    foreach (OPERATOR_KEYS as $k => $max) if (array_key_exists($k, $in)) $set("legal_$k", $k === 'email' ? $email($in[$k]) : clean_text($in[$k], $max));
    $set('legal_updated', date('d.m.Y'));
    json_out(['ok' => true]);
}
if (($in['action'] ?? '') === 'club') {
    $id = (int)($in['club'] ?? 0);
    if ($acc['kind'] !== 'coach' || !in_array($id, array_column(admin_clubs($acc), 'id'), true)) json_out(['ok' => false, 'error' => 'Diesen Verein verwaltest du nicht.'], 403);
    pdb()->prepare('UPDATE clubs SET legal_name = ?, address = ?, privacy_email = ?, dpo = ? WHERE id = ?')
        ->execute([clean_text($in['legalName'] ?? '', 100), clean_text($in['address'] ?? '', 200), $email($in['email'] ?? ''), clean_text($in['dpo'] ?? '', 200), $id]);
    $set('legal_updated', date('d.m.Y'));
    json_out(['ok' => true]);
}
json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
