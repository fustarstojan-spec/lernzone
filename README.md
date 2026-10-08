# Heimstetten Lernzone

Lern-App für die U14 des SV Heimstetten: Spielphasenmodell, Zonen-Trainer, Quiz und persönlicher Bereich (Trikotnummer + PIN).

## Ordnerstruktur

```
index.html            Grundgerüst der Seite
css/app.css           Design (Vereinsfarben, Layout, Dark Mode)
js/config.js          mode "auto" (Standard): erkennt selbst, ob PHP läuft; sonst "local" (Weg A) oder "api" (Weg B)
js/store.js           Datenzugriff – die einzige Stelle, die Daten liest/speichert
js/pitch.js           Spielfeld-Grafik (SVG)
js/app.js             Oberfläche: Startseite, Phasen, Quiz, Zonen, Anmeldung, Mein Bereich (enthält keine Daten)
js/me.js              Spieler mit Server: Trainingsbeteiligung, Befindens-Barometer, Profil
js/coach.js           Trainer-Bereich: Kader, Trainings, Trainer-Konten
data/team.json        Teamname, Grundordnung, Trikotfarben, Positionskürzel (für Profile und Spielsituationen)
data/zones.json       5 Spuren, 3 Drittel, Maße
data/phases.json      Die Spielphasen 1–4 und Phase 5 „Standards“: Grundlagen, Prinzipien, Situation, Quiz
data/plans.json       Trainingspläne und Ziele (Vorlagen "feld" und "tw")
data/players.json     Kader: Nummer, Position, Plan – OHNE PINs
data/demo-pins.json   Nur Weg A: PINs im Klartext
api/                  Nur Weg B: PHP-Schnittstelle
tools/                Nur Weg B: Datenbankschema und Kader-Import
storage/              Nur Weg B: SQLite-Datenbank (nicht öffentlich)
```

## Inhalte ändern

Alle Texte und Fragen stehen in `data/*.json`. Am Code muss dafür nichts geändert werden.

Quizfrage in `data/phases.json`:

```json
{ "q": "Frage", "options": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"], "correct": 0, "why": "Erklärung" }
```

`correct` ist die Position der richtigen Antwort (0 = erste). Die Reihenfolge wird in der App gemischt.

Spielsituation (`sit`): Koordinaten in Metern auf einem 68 × 105 m-Feld, `x` von links nach rechts, `y` von oben (gegnerisches Tor) nach unten (eigenes Tor).
`own: [[Position, x, y]]` (Kürzel aus `data/team.json`, z. B. "IV"), `opp: [[x, y]]`, `ball: [x, y]`, `arrows: [{ "f": [x,y], "t": [x,y], "k": "pass" | "run" }]`.

## Trainer-Bereich (nur mit PHP, z. B. XAMPP)

Mein Bereich → „Trainer-Bereich“ (oder graues „+“-Trikot) → Name wählen → eigene 6-stellige Trainer-PIN.

- **Kader:** Trikot antippen → Einwilligung der Eltern, Profil, Trainingsbeteiligung, Befinden, Positionen, PIN. Graues „+“ = neuer Spieler. Roter Punkt = bitte ansprechen.
- **Trainings:** Training anlegen (Datum, Uhrzeit, Notiz) → Anwesenheit per Antippen der Trikots, darunter die Rückmeldungen aus dem Barometer.
- **Trainer:** Admins legen Trainer an, vergeben Admin-Rechte und entfernen Konten. Alle anderen ändern hier Namen und PIN ihres eigenen Kontos.

Erstes Trainer-Konto:
- XAMPP / localhost: beim ersten Öffnen des Trainer-Bereichs direkt in der App (wird Admin).
- Echter Server: `php tools/set_coach_pin.php "Name" 123456` (das Anlegen über die App geht dort aus Sicherheitsgründen nicht).

### Datenschutz

- Profil und Befinden sehen nur das Kind selbst und die Trainer – keine Funktionen zwischen den Kindern.
- Profil und Barometer sind erst freigeschaltet, wenn der Trainer „Einwilligung der Eltern liegt vor“ setzt.
- Keine Gesundheitsdetails: „nicht fit“ ist nur ein Hinweis an den Trainer, kein Befund.
- Admins können einen Spieler mit allen Daten löschen (Kader → Spieler → „Spieler löschen“).
- Die Datenbank (`storage/lernzone.sqlite`) wird nie ins Repository übernommen.

Die Datenbank wird beim ersten Aufruf automatisch angelegt bzw. ergänzt. Liegt `data/demo-pins.json` vor, wird der Demo-Kader mit PIN 1234 übernommen.
Datenbank zurücksetzen: Apache stoppen, `storage/lernzone.sqlite` löschen, Apache starten.

## Weg A – ohne Server-Login

`js/config.js` → `mode: "local"`. Läuft auf jedem einfachen Webspace, ohne PHP.
Fortschritt bleibt im Browser des jeweiligen Geräts. Die PINs in `demo-pins.json` sind öffentlich lesbar, also kein echter Schutz.

Hinweis: Direkt als Datei geöffnet (Doppelklick) lädt die App keine Inhalte. Sie braucht einen Webserver, lokal z. B. `php -S localhost:8000` im Projektordner.

## Weg B – mit echtem Login (PHP)

Voraussetzung: Webspace mit PHP 8 und PDO/SQLite (bei fast allen Hostern Standard).

1. Alle Dateien hochladen, **außer** `data/demo-pins.json`.
2. In `js/config.js` auf `mode: "api"` umstellen.
3. Auf dem Server (SSH) im Projektordner: `php tools/import_players.php`
   → legt die Datenbank an, übernimmt `data/players.json` und gibt einmal eine Liste mit neuen, zufälligen PINs aus. Ausdrucken und verteilen.
   Einzelne PIN neu vergeben: `php tools/import_players.php 7`
4. Prüfen, dass `storage/` und `tools/` von außen nicht erreichbar sind (`.htaccess` liegt bei; bei Nginx entsprechend sperren). Besser: `storage/` außerhalb des Web-Ordners ablegen und den Pfad in `api/config.php` anpassen.
5. Nur über HTTPS betreiben.

PINs werden mit `password_hash()` gespeichert, nach 5 Fehlversuchen ist die Anmeldung 5 Minuten gesperrt.

### Schnittstelle (für eigene Erweiterungen)

| Datei | Methode | Eingabe | Antwort |
|---|---|---|---|
| `api/me.php` | GET | – | `{ user, coach: { active, hasPin, canSetup } }` |
| `api/login.php` | POST | `{ nr, pin }` | `{ ok, user }` / `{ ok: false, error }` |
| `api/logout.php` | POST | – | `{ ok }` |
| `api/progress.php` | GET | – | `{ quiz, tasks }` |
| `api/progress.php` | POST | `{ quiz, tasks }` | `{ ok }` |
| `api/players.php` | GET | – | `[{ nr, pos, plan, posOff, posDef }]` (Trainer: + name, consent, flag) |
| `api/players.php` | GET (Trainer) | `?nr=8` | `{ player, profile, attendance, moods, flag }` |
| `api/players.php` | POST (Trainer) | `{ action: "setconsent", nr, consent }` | `{ ok, player }` |
| `api/players.php` | POST (Admin) | `{ action: "delete", nr }` | `{ ok }` |
| `api/players.php` | POST (Trainer) | `{ nr, type: "tw"\|"feld", pin }` | `{ ok, player }` |
| `api/players.php` | POST (Trainer) | `{ action: "setpin", nr, pin }` | `{ ok, nr }` |
| `api/players.php` | POST (Trainer) | `{ action: "setpos", nr, posOff, posDef }` | `{ ok, player }` |
| `api/coach.php` | POST | `{ action: "login", id, pin }` / `{ action: "setup", name, pin }` / `{ action: "logout" }` | `{ ok, coach }` |
| `api/coaches.php` | GET | – | `[{ id, name }]` |
| `api/coaches.php` | POST | `{ action: "add"\|"update"\|"delete", … }` | `{ ok, coach }` |
| `api/my.php` | GET (Spieler) | – | `{ consent, profile, attendance, today }` |
| `api/profile.php` | POST (Spieler) | `{ profile }` | `{ ok, profile }` |
| `api/mood.php` | POST (Spieler) | `{ training, phase: "vor"\|"nach", data }` | `{ ok, data }` |
| `api/trainings.php` | GET / POST (Trainer) | `?id=` / `{ action: "create"\|"delete"\|"attend", … }` | |

`user = { nr, pos, plan, posOff, posDef }`.
`quiz = { "<modul>": { best, of, last } }`, `tasks = { "<Jahr>-W<KW>": { "<index>": true } }`.

### Nächste Ausbaustufen

- Lernfortschritt aller Spieler in der Trainer-Ansicht.
- Individuelle Pläne pro Spieler statt Vorlagen: Tabelle `plans` und `api/plan.php`.
- Datenschutz: Einwilligung der Eltern einholen und mit dem Verein abstimmen, bevor Fortschrittsdaten auf einem Server gespeichert werden.
