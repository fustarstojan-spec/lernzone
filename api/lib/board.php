<?php
/* Taktiktafel-Daten (Taktiktafel, Übungsskizzen) */
/* Eingaben prüfen: nur bekannte Felder, Zahlen begrenzt */
function board_clean($d): array {
    $num = fn($v, $lo, $hi) => round(max($lo, min($hi, (float)$v)), 2);
    $pt  = fn($p) => is_array($p) && count($p) === 2 ? [$num($p[0], -3, 71), $num($p[1], -5, 110)] : null;
    $items = []; $lines = [];
    foreach (array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 60) as $it) {
        if (!is_array($it) || !in_array($it['t'] ?? '', ['own', 'opp', 'ball'], true)) continue;
        $o = ['id' => substr(preg_replace('/[^a-z0-9]/i', '', (string)($it['id'] ?? '')), 0, 12) ?: bin2hex(random_bytes(4)),
              't' => $it['t'], 'x' => $num($it['x'] ?? 34, -3, 71), 'y' => $num($it['y'] ?? 52.5, -5, 110)];
        if ($it['t'] !== 'ball') {
            $o['lab'] = clean_text($it['lab'] ?? '', 4);
            $nr = (int)($it['nr'] ?? 0); if ($it['t'] === 'own' && $nr >= 1 && $nr <= 99) $o['nr'] = $nr;
        }
        $items[] = $o;
    }
    foreach (array_slice(is_array($d['lines'] ?? null) ? $d['lines'] : [], 0, 60) as $l) {
        if (!is_array($l) || !in_array($l['k'] ?? '', ['pass', 'run', 'line'], true)) continue;
        $f = $pt($l['f'] ?? null); $t = $pt($l['t'] ?? null); if (!$f || !$t) continue;
        $lines[] = ['id' => substr(preg_replace('/[^a-z0-9]/i', '', (string)($l['id'] ?? '')), 0, 12) ?: bin2hex(random_bytes(4)), 'k' => $l['k'], 'f' => $f, 't' => $t];
    }
    $f = preg_match('/^[0-9]-[0-9](-[0-9]){1,3}$/', (string)($d['formation'] ?? '')) ? (string)$d['formation'] : '';
    return ['items' => $items, 'lines' => $lines] + ($f !== '' ? ['formation' => $f] : []);
}
