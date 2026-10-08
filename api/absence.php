<?php
/*
 * Training absagen (nur angemeldeter Spieler, nur Trainings, bis 2 Stunden vor Beginn)
 * POST {action:"set", id, reason}   reason: schule | krank | urlaub | sonst
 * POST {action:"withdraw", id}      Absage zurücknehmen („Ich bin doch dabei“)
 * → {ok, upcoming:[…]}
 */
require __DIR__ . '/config.php';
$u = require_user();
require_method('POST');
$in = json_in();
$id = (int)($in['id'] ?? 0);
$st = db()->prepare("SELECT * FROM trainings WHERE id = ? AND kind = 'training'");
$st->execute([$id]);
$t = $st->fetch(PDO::FETCH_ASSOC);
if (!$t) json_out(['ok' => false, 'error' => 'Dieses Training gibt es nicht.'], 404);
if (time() >= absence_deadline($t))
    json_out(['ok' => false, 'error' => 'Absagen geht nur bis ' . ABSENCE_HOURS . ' Stunden vor dem Training. Sag bitte deinem Trainer direkt Bescheid.'], 400);

switch ($in['action'] ?? '') {
    case 'set':
        $reason = (string)($in['reason'] ?? '');
        if (!isset(ABSENCE_REASONS[$reason])) json_out(['ok' => false, 'error' => 'Bitte einen Grund wählen.'], 400);
        db()->prepare('INSERT INTO absences (training_id, nr, reason) VALUES (?, ?, ?)
                       ON CONFLICT(training_id, nr) DO UPDATE SET reason = excluded.reason, created_at = CURRENT_TIMESTAMP')->execute([$id, $u['nr'], $reason]);
        db()->prepare('DELETE FROM attendance WHERE training_id = ? AND nr = ?')->execute([$id, $u['nr']]);
        break;
    case 'withdraw':
        db()->prepare('DELETE FROM absences WHERE training_id = ? AND nr = ?')->execute([$id, $u['nr']]);
        break;
    default:
        json_out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
}
json_out(['ok' => true, 'upcoming' => upcoming_for($u['nr'])]);
