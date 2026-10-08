<?php
// Abgelöst ab 0.8.0 – bitte verwenden:  php tools/create_coach.php "Vorname" benutzername
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
exit("Abgelöst: php tools/create_coach.php \"Vorname\" benutzername\n");
