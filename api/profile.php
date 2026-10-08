<?php
/*
 * Eigenes Profil (nur Spieler selbst; Trainer lesen es über api/players.php?nr=)
 * GET              → {ok, profile}
 * POST {profile}   → speichern (erst nach Einwilligung der Eltern)
 * Felder: vorname, nachname, geb_tag, geb_monat, schule{mo..fr: "HH:MM"}, fuss, wunsch, vorbild, ziel, trikot, schuh
 */
require __DIR__ . '/config.php';
$u = require_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['ok' => true, 'profile' => (object)profile_of($u['nr'])]);

require_method('POST');
require_consent($u);
$in = json_in()['profile'] ?? [];
if (!is_array($in)) $in = [];
if (!is_array($in['schule'] ?? null)) $in['schule'] = [];

$pick = fn(string $k, array $allowed) => in_array((string)($in[$k] ?? ''), $allowed, true) ? (string)$in[$k] : '';
$time = fn($v) => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$v) ? (string)$v : '';
$p = [
    'vorname'   => clean_text($in['vorname'] ?? '', 40),
    'nachname'  => clean_text($in['nachname'] ?? '', 40),
    'geb_tag'   => int_in($in['geb_tag'] ?? null, 1, 31),
    'geb_monat' => int_in($in['geb_monat'] ?? null, 1, 12),
    'schule'    => [],
    'fuss'      => $pick('fuss', ['links', 'rechts', 'beide']),
    'wunsch'    => $pick('wunsch', valid_positions()),
    'vorbild'   => clean_text($in['vorbild'] ?? '', 60),
    'ziel'      => clean_text($in['ziel'] ?? '', 200),
    'trikot'    => $pick('trikot', ['140', '152', '164', '176', 'XS', 'S', 'M', 'L', 'XL']),
    'schuh'     => int_in($in['schuh'] ?? null, 28, 50),
];
foreach (['mo', 'di', 'mi', 'do', 'fr'] as $d) $p['schule'][$d] = $time($in['schule'][$d] ?? '');

db()->prepare('INSERT INTO profiles (nr, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(nr) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP')
    ->execute([$u['nr'], json_encode($p, JSON_UNESCAPED_UNICODE)]);
json_out(['ok' => true, 'profile' => $p]);
