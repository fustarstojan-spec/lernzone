<?php
/* Bild einer Übung ausgeben (nur Trainer des Vereins) – GET ?id=5 */
require __DIR__ . '/config.php';
require_coach();
$st = pdb()->prepare('SELECT image FROM drills WHERE id = ? AND club_id = ?');
$st->execute([(int)($_GET['id'] ?? 0), (int)team_info()['clubId']]);
$rel = (string)$st->fetchColumn();
$path = STORAGE_DIR . '/' . $rel;
if ($rel === '' || !preg_match('#^drills/\d+/[\w.-]+$#', $rel) || !is_file($path)) { http_response_code(404); exit; }
$type = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][pathinfo($path, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
header('Content-Type: ' . $type);
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=86400');
header('X-Content-Type-Options: nosniff');
readfile($path);
