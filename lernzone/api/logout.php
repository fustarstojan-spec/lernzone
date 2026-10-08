<?php
// POST → {ok}
require __DIR__ . '/config.php';
require_method('POST');
$_SESSION = [];
session_destroy();
json_out(['ok' => true]);
