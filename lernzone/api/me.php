<?php
// GET → {user} (null, wenn nicht angemeldet)
require __DIR__ . '/config.php';
json_out(['user' => current_user()]);
