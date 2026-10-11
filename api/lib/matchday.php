<?php
/*
 * Spieltag (ab 0.31.0): Spielart, Spielzeit je Spielart (Einstellung), Kader-Gründe
 * Spielart wird am Kalendertitel erkannt (oder pro Spiel vom Trainer gesetzt, match_calls.gtype).
 */
const GAME_TYPES = ['liga' => 'Ligaspiel', 'freundschaft' => 'Freundschaftsspiel', 'pokal' => 'Pokalspiel', 'turnier' => 'Turnier'];
const GAME_DURATION_DEFAULT = ['liga' => 70, 'freundschaft' => 70, 'pokal' => 70, 'turnier' => 20];
const GAME_PAUSES_DEFAULT = ['liga' => 1, 'freundschaft' => 1, 'pokal' => 1, 'turnier' => 0];   // Halbzeitpausen (ab 0.32.0): Abschnitte = Pausen + 1
// Gründe für „diesmal nicht im Kader“ – das Kind sieht nur diesen Text, nie die Trainer-Notiz. Keine Gesundheitsgründe.
const KADER_REASONS = [
    'rotation'  => 'Rotation – diesmal sind andere dran',
    'training'  => 'Trainingsbeteiligung',
    'absage'    => 'Abgesagt / nicht verfügbar',
    'verhalten' => 'Verhalten / Pünktlichkeit',
    'andere'    => 'Einsatz in einer anderen Mannschaft',
    'pause'     => 'Pause zur Erholung',
    'gespraech' => 'Dein Trainer spricht mit dir',
];

/* Spielart: Vorgabe des Trainers, sonst Turnier (Kalender-Art) oder Stichwort im Titel, sonst Ligaspiel */
function game_type(string $kind, string $title, string $override = ''): string {
    if (isset(GAME_TYPES[$override])) return $override;
    if ($kind === 'turnier') return 'turnier';
    $t = mb_strtolower($title);
    if (str_contains($t, 'pokal')) return 'pokal';
    if (preg_match('/freundschaft|testspiel|\btest\b|\bfs\b/u', $t)) return 'freundschaft';
    return 'liga';
}
function game_durations(): array {
    $v = db()->query("SELECT value FROM settings WHERE name = 'match_durations'")->fetchColumn();
    $d = $v ? (json_decode($v, true) ?: []) : [];
    $out = [];
    foreach (GAME_DURATION_DEFAULT as $k => $def) $out[$k] = isset($d[$k]) ? max(1, min(240, (int)$d[$k])) : $def;
    return $out;
}
function game_pauses(): array {
    $v = db()->query("SELECT value FROM settings WHERE name = 'match_pauses'")->fetchColumn();
    $d = $v ? (json_decode($v, true) ?: []) : [];
    $out = [];
    foreach (GAME_PAUSES_DEFAULT as $k => $def) $out[$k] = isset($d[$k]) ? max(0, min(5, (int)$d[$k])) : $def;
    return $out;
}
function game_type_of(int $id): string {
    $st = db()->prepare('SELECT t.kind, t.title, COALESCE(c.gtype, \'\') AS gtype FROM trainings t LEFT JOIN match_calls c ON c.training_id = t.id WHERE t.id = ?');
    $st->execute([$id]); $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ? game_type((string)$r['kind'], (string)$r['title'], (string)$r['gtype']) : 'liga';
}

/* Kader aus einer Aufstellung übernehmen: Startelf + Einwechselspieler = Kader, alle anderen „nicht dabei“ (Gründe bleiben) */
function kader_from_lineup(int $id, array $starters, array $bench, ?int $by): void {
    $in = array_values(array_unique(array_merge($starters, $bench)));
    if (!$in) return;
    $all = array_map('intval', db()->query('SELECT nr FROM players')->fetchAll(PDO::FETCH_COLUMN));
    $up = db()->prepare("INSERT INTO match_call_players (training_id, nr, status) VALUES (?, ?, ?)
                         ON CONFLICT(training_id, nr) DO UPDATE SET status = excluded.status,
                           reason = CASE WHEN excluded.status = 'kader' THEN '' ELSE match_call_players.reason END");
    foreach ($all as $nr) $up->execute([$id, $nr, in_array($nr, $in, true) ? 'kader' : 'out']);
    db()->prepare('INSERT INTO match_calls (training_id, updated_by) VALUES (?, ?) ON CONFLICT(training_id) DO UPDATE SET updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP')
        ->execute([$id, $by]);
}
