# Heimstetten Lernzone

Lern-App für die U14 des SV Heimstetten: Spielphasenmodell, Zonen-Trainer, Quiz und persönlicher Bereich (Trikotnummer + PIN).

## Ordnerstruktur

```
index.html            Grundgerüst der Seite
css/app.css           Design (Vereinsfarben, Layout, Dark Mode)
js/config.js          Umschalter: mode "local" (Weg A) oder "api" (Weg B)
js/store.js           Datenzugriff – die einzige Stelle, die Daten liest/speichert
js/pitch.js           Spielfeld-Grafik (SVG)
js/app.js             Oberfläche und Abläufe (enthält keine Daten)
data/team.json        Teamname, System, Trikotfarben, Torhüter-Nummern
data/zones.json       5 Spuren, 3 Drittel, Maße
data/phases.json      Die 4 Spielphasen: Grundlagen, Prinzipien, Situation, Quiz
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
`own: [[Nr, x, y]]`, `opp: [[x, y]]`, `ball: [x, y]`, `arrows: [{ "f": [x,y], "t": [x,y], "k": "pass" | "run" }]`.

## Weg A – ohne Server-Login (aktueller Stand)

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
| `api/me.php` | GET | – | `{ user }` oder `{ user: null }` |
| `api/login.php` | POST | `{ nr, pin }` | `{ ok, user }` / `{ ok: false, error }` |
| `api/logout.php` | POST | – | `{ ok }` |
| `api/progress.php` | GET | – | `{ quiz, tasks }` |
| `api/progress.php` | POST | `{ quiz, tasks }` | `{ ok }` |

`user = { nr, pos, plan }`.
`quiz = { "<modul>": { best, of, last } }`, `tasks = { "<Jahr>-W<KW>": { "<index>": true } }`.

### Nächste Ausbaustufen

- Trainer-Ansicht (`api/coach.php`): Fortschritt aller Spieler, eigener Trainer-Login.
- Individuelle Pläne pro Spieler statt Vorlagen: Tabelle `plans` und `api/plan.php`.
- Datenschutz: Einwilligung der Eltern einholen und mit dem Verein abstimmen, bevor Fortschrittsdaten auf einem Server gespeichert werden.
