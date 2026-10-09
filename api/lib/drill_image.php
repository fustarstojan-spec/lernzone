<?php
/* Bilder zu Übungen (ab 0.24.1): liegen in storage/drills/<Verein>/ (nicht öffentlich), Ausgabe über api/drill_image.php */
const DRILL_IMG_MAX = 6 * 1024 * 1024;   // höchstens 6 MB vor dem Verkleinern

/* Bild aus Daten-URL oder Rohdaten speichern → relativer Pfad unter storage/, oder Fehlermeldung (string mit Präfix "!") */
function drill_image_store(int $club, int $drill, string $bytes): string {
    if (str_starts_with($bytes, 'data:')) $bytes = base64_decode(substr($bytes, strpos($bytes, ',') + 1), true) ?: '';
    if ($bytes === '' || strlen($bytes) > DRILL_IMG_MAX) return '!Das Bild ist zu groß (höchstens 6 MB).';
    $info = @getimagesizefromstring($bytes);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? null;
    if (!$ext) return '!Bitte ein Bild als JPG, PNG oder WebP hochladen.';
    // verkleinern (max. 1600 px breit) und als JPG speichern, wenn GD da ist
    if (function_exists('imagecreatefromstring') && ($im = @imagecreatefromstring($bytes))) {
        $w = imagesx($im); $h = imagesy($im);
        if ($w > 1600) { $nh = (int)round($h * 1600 / $w); $r = imagecreatetruecolor(1600, $nh); imagecopyresampled($r, $im, 0, 0, 0, 0, 1600, $nh, $w, $h); $im = $r; }
        else { $r = imagecreatetruecolor($w, $h); imagefill($r, 0, 0, imagecolorallocate($r, 255, 255, 255)); imagecopy($r, $im, 0, 0, 0, 0, $w, $h); $im = $r; }
        ob_start(); imagejpeg($im, null, 85); $bytes = (string)ob_get_clean(); $ext = 'jpg';
    }
    $dir = STORAGE_DIR . "/drills/$club";
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return '!Bild konnte nicht gespeichert werden.';
    $rel = "drills/$club/$drill-" . bin2hex(random_bytes(4)) . ".$ext";
    if (@file_put_contents(STORAGE_DIR . '/' . $rel, $bytes) === false) return '!Bild konnte nicht gespeichert werden.';
    return $rel;
}
function drill_image_delete(string $rel): void {
    if ($rel !== '' && preg_match('#^drills/\d+/[\w.-]+$#', $rel)) @unlink(STORAGE_DIR . '/' . $rel);
}
