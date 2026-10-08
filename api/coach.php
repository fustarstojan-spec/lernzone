<?php
// Abgelöst ab 0.8.0: Anmeldung nur noch mit Benutzername + Passwort über api/auth.php
require __DIR__ . '/config.php';
json_out(['ok' => false, 'error' => 'Diese Anmeldung gibt es nicht mehr. Bitte lade die Seite neu.'], 410);
