<?php
// GET → {user, coach:{active, hasPin, canSetup}}
require __DIR__ . '/config.php';
json_out(['user' => current_user(), 'coach' => coach_state()]);
