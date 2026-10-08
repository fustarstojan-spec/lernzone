<?php
// POST → {ok}  (gleich wie api/auth.php {action:"logout"})
require __DIR__ . '/config.php';
require_method('POST');
logout_session();
json_out(['ok' => true, 'csrf' => csrf_token()]);
