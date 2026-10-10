<?php
/* Trainingspläne als PDF (ab 0.26.0): liegen in storage/sessions/<Mannschaft>/ (nicht öffentlich), Ausgabe über api/session_pdf.php */
const SESSION_PDF_MAX = 15 * 1024 * 1024;   // höchstens 15 MB

/* PDF aus Daten-URL speichern → relativer Pfad unter storage/, oder Fehlermeldung mit Präfix "!" */
function session_pdf_store(int $team, int $session, string $data): string {
    if (str_starts_with($data, 'data:')) $data = base64_decode(substr($data, strpos($data, ',') + 1), true) ?: '';
    if ($data === '') return '!Das PDF konnte nicht gelesen werden.';
    if (strlen($data) > SESSION_PDF_MAX) return '!Das PDF ist zu groß (höchstens 15 MB).';
    if (!str_starts_with($data, '%PDF-')) return '!Bitte eine PDF-Datei hochladen.';
    $dir = STORAGE_DIR . "/sessions/$team";
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return '!PDF konnte nicht gespeichert werden.';
    $rel = "sessions/$team/$session-" . bin2hex(random_bytes(4)) . '.pdf';
    if (@file_put_contents(STORAGE_DIR . '/' . $rel, $data) === false) return '!PDF konnte nicht gespeichert werden.';
    return $rel;
}
function session_pdf_delete(string $rel): void {
    if ($rel !== '' && preg_match('#^sessions/\d+/[\w.-]+\.pdf$#', $rel)) @unlink(STORAGE_DIR . '/' . $rel);
}
