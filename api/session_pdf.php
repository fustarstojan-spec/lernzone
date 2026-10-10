<?php
/* Trainingsplan-PDF einer Einheit ausgeben (nur Trainer der Mannschaft) – GET ?id=5[&download=1] */
require __DIR__ . '/config.php';
require_coach();
$st = db()->prepare('SELECT pdf, pdf_name FROM sessions WHERE id = ?');
$st->execute([(int)($_GET['id'] ?? 0)]);
$r = $st->fetch(PDO::FETCH_ASSOC) ?: ['pdf' => '', 'pdf_name' => ''];
$path = STORAGE_DIR . '/' . $r['pdf'];
if ($r['pdf'] === '' || !preg_match('#^sessions/' . (int)team_id() . '/[\w.-]+\.pdf$#', $r['pdf']) || !is_file($path)) { http_response_code(404); exit; }
$name = preg_replace('/[^\w .()äöüÄÖÜß-]/u', '_', $r['pdf_name'] ?: 'Trainingsplan.pdf');
header('Content-Type: application/pdf');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: ' . (isset($_GET['download']) ? 'attachment' : 'inline') . "; filename*=UTF-8''" . rawurlencode($name));
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
readfile($path);
