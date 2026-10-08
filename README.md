# Heimstetten Lernzone

Lern-App für die U14 des SV Heimstetten: Spielphasenmodell, Zonen-Trainer, Quiz, persönlicher Bereich und Trainer-Bereich. Mit PHP nur nach Anmeldung (Benutzername + Passwort).

## Ordnerstruktur

```
index.html            Grundgerüst der Seite
css/app.css           Design (Vereinsfarben, Layout, Dark Mode)
js/config.js          mode "auto" (Standard): erkennt selbst, ob PHP läuft; sonst "local" (Weg A) oder "api" (Weg B)
js/store.js           Datenzugriff – die einzige Stelle, die Daten liest/speichert
js/pitch.js           Spielfeld-Grafik (SVG)
js/app.js             Oberfläche: Startseite, Phasen, Quiz, Zonen, Mein Bereich (enthält keine Daten)
js/auth.js            Anmeldung (Weg B): Anmelden, eigenes Passwort festlegen, Passwort ändern, erstes Trainer-Konto
js/me.js              Spieler mit Server: Trainingsbeteiligung, Befindens-Barometer, Profil
js/coach.js           Trainer-Bereich: Kader, Trainings, Trainer-Konten, Kalender-Einstellung
js/calendar.js        Termine aus dem Google-Kalender: Nächster Termin, alle Termine
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

## Anmeldung (nur mit PHP, z. B. XAMPP)

Mit PHP ist die App erst nach Anmeldung sichtbar: **Benutzername + Passwort**.

- **Neues Konto:** Trainer legt Spieler bzw. Trainer an → bekommt Benutzername + **Einmal-Code** (7 Tage gültig) → persönlich weitergeben.
  Erste Anmeldung mit Benutzername + Code → sofort eigenes Passwort festlegen. Der Trainer kennt das Passwort nie.
- **Passwort vergessen:** Kader → Spieler → „Neuen Einmal-Code erzeugen“ (Trainer-Konten: Trainer → antippen, nur Admins).
- **Passwort ändern:** Mein Bereich bzw. Trainer-Bereich → „Passwort ändern“. Andere Geräte werden dabei abgemeldet.
- **Passwort-Regeln:** mindestens 8 Zeichen, nicht der Benutzername, keine Allerwelts-Passwörter. Tipp für Kinder: drei Wörter mit Bindestrich.
- **Umstieg von 0.7.0:** Spieler melden sich einmal mit `spielerNN` (z. B. `spieler8`) und der alten PIN an, Trainer mit ihrem Vornamen (klein, z. B. `trainer`) und der alten Trainer-PIN – danach eigenes Passwort festlegen.

Erstes Trainer-Konto:
- XAMPP / localhost: Gibt es noch keinen Trainer, zeigt die App die Seite „Erstes Trainer-Konto“ (wird Admin).
- Echter Server: `php tools/create_coach.php "Vorname" benutzername` → gibt einen Einmal-Code aus.

### Sicherheit

- Passwörter und Codes nur als Hash (Argon2id, sonst bcrypt), Sperre nach 5 Fehlversuchen pro Konto für 5 Minuten.
- Jede Änderung braucht ein CSRF-Token aus `api/me.php`; Sitzungs-Cookie `HttpOnly`, `SameSite=Strict`, auf HTTPS `Secure`.
- Trainer werden nach 8 Stunden ohne Aktivität abgemeldet; neuer Code oder Passwortwechsel beendet alle anderen Sitzungen des Kontos.
- `.htaccess`: Sicherheits-Header (CSP, X-Frame-Options, Referrer-Policy …), `data/demo-pins.json` und Projektdateien sind gesperrt.
  Auf dem echten Server mit HTTPS zusätzlich die HSTS-Zeile in `.htaccess` einschalten.

## Trainer-Bereich

Nach der Anmeldung als Trainer: Trikot oben rechts → Trainer-Bereich.

- **Kader:** Trikot antippen → Einwilligung der Eltern, Profil, Trainingsbeteiligung, Befinden, Positionen, Zugang (Benutzername, Einmal-Code). Graues „+“ = neuer Spieler. Roter Punkt = bitte ansprechen.
- **Trainings:** Training anlegen (Datum, Uhrzeit, Notiz) → Anwesenheit per Antippen der Trikots, darunter die Rückmeldungen aus dem Barometer.
- **Trainer:** Admins legen Trainer an, vergeben Admin-Rechte, erzeugen Codes und entfernen Konten. Alle anderen ändern hier ihren Namen.

## Google-Kalender

Trainer-Bereich → Trainer (nur Admin) → **Google-Kalender**: Einbettungs-Link, iframe-Code oder iCal-Adresse einfügen → Speichern.

- Der Server liest den Kalender höchstens alle 15 Minuten (Kopie in `storage/calendar-cache.ics`) und legt alle Termine der letzten 30 und nächsten 60 Tage an.
- Verschobene, abgesagte und gelöschte Termine werden übernommen. Termine mit Anwesenheit oder Rückmeldungen werden nie gelöscht.
- Art des Termins aus dem Titel: `data/team.json` → `calendar.types` (Stichwörter, erstes passendes gewinnt; sonst „Termin“).
- Öffentlicher Kalender: Einbettungs-Link genügt. Privater Kalender: Google Kalender → Einstellungen und Freigabe → „Privatadresse im iCal-Format“ einfügen (wie ein Passwort behandeln; steht nur in der Datenbank).
- XAMPP braucht die PHP-Erweiterung `curl` (Standard) und Internet. Fehler stehen in der Kalender-Karte.

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

1. Alle Dateien hochladen, **außer** `data/demo-pins.json` und `storage/*.sqlite`.
2. In `js/config.js` auf `mode: "api"` umstellen.
3. Auf dem Server (SSH) im Projektordner: `php tools/create_coach.php "Vorname" benutzername` → erstes Admin-Konto mit Einmal-Code.
4. Spieler im Trainer-Bereich anlegen – oder `php tools/import_players.php` übernimmt `data/players.json` und gibt eine Liste mit Benutzernamen und Einmal-Codes aus.
5. Prüfen, dass `storage/` und `tools/` von außen nicht erreichbar sind (`.htaccess` liegt bei; bei Nginx entsprechend sperren). Besser: `storage/` außerhalb des Web-Ordners ablegen und den Pfad in `api/config.php` anpassen.
6. Nur über HTTPS betreiben und die HSTS-Zeile in `.htaccess` einschalten.

### Schnittstelle (für eigene Erweiterungen)

| Datei | Methode | Eingabe | Antwort |
|---|---|---|---|
| `api/me.php` | GET | – | `{ user, coach, account, pending, csrf }` |
| `api/auth.php` | POST | `{ action: "login", username, password }` | `{ ok, state: "ok"\|"setpw", user, coach, csrf }` |
| `api/auth.php` | POST | `{ action: "setpw"\|"change"\|"setup"\|"logout", … }` | `{ ok, … }` |
| `api/accounts.php` | POST (Trainer) | `{ action: "code"\|"rename", kind: "player"\|"coach", ref, username? }` | `{ ok, username, code?, expires? }` |
| `api/progress.php` | GET | – | `{ quiz, tasks }` |
| `api/progress.php` | POST | `{ quiz, tasks }` | `{ ok }` |
| `api/players.php` | GET (angemeldet) | – | `[{ nr, pos, plan, posOff, posDef }]` (Trainer: + name, consent, flag, username) |
| `api/players.php` | GET (Trainer) | `?nr=8` | `{ player, profile, attendance, moods, flag }` |
| `api/players.php` | POST (Trainer) | `{ action: "setconsent", nr, consent }` | `{ ok, player }` |
| `api/players.php` | POST (Admin) | `{ action: "delete", nr }` | `{ ok }` |
| `api/players.php` | POST (Trainer) | `{ nr, type: "tw"\|"feld", username?, posOff?, posDef? }` | `{ ok, player, username, code, expires }` |
| `api/players.php` | POST (Trainer) | `{ action: "setpos", nr, posOff, posDef }` | `{ ok, player }` |
| `api/coaches.php` | GET (Trainer) | – | `[{ id, name, isAdmin, username }]` |
| `api/coaches.php` | POST | `{ action: "add", name, username?, isAdmin }` / `{ action: "update"\|"delete", … }` | `{ ok, coach, code? }` |
| `api/my.php` | GET (Spieler) | – | `{ consent, profile, attendance, today }` |
| `api/profile.php` | POST (Spieler) | `{ profile }` | `{ ok, profile }` |
| `api/mood.php` | POST (Spieler) | `{ training, phase: "vor"\|"nach", data }` | `{ ok, data }` |
| `api/trainings.php` | GET / POST (Trainer) | `?id=` / `{ action: "create"\|"delete"\|"attend", … }` | |
| `api/calendar.php` | GET (angemeldet) | `?days=14` | `{ next, upcoming, status }` |
| `api/calendar.php` | POST | `{ action: "seturl", url }` (Admin) / `{ action: "refresh" }` (Trainer) | `{ ok, status }` |

`user = { nr, pos, plan, posOff, posDef }`.
`quiz = { "<modul>": { best, of, last } }`, `tasks = { "<Jahr>-W<KW>": { "<index>": true } }`.

### Nächste Ausbaustufen

- Lernfortschritt aller Spieler in der Trainer-Ansicht.
- Individuelle Pläne pro Spieler statt Vorlagen: Tabelle `plans` und `api/plan.php`.
- Datenschutz: Einwilligung der Eltern einholen und mit dem Verein abstimmen, bevor Fortschrittsdaten auf einem Server gespeichert werden.
