# Änderungsprotokoll

Format: `MAJOR.MINOR.PATCH` – PATCH = Korrektur, MINOR = neue Inhalte oder Funktionen, MAJOR = großer Umbau (z. B. Weg B live).

## 0.21.0 – 2026-10-09
- **Mehrere Vereine und Mannschaften (Schritt 1):** Aufbau Verein → Mannschaft → Mitglieder mit Rolle (Spieler/Trainer, Admin pro Mannschaft)
  - Neue Plattform-Datenbank `storage/platform.sqlite` (Vereine, Mannschaften, Konten, Trainer, Mitgliedschaften); jede Mannschaft hat ihre eigene Datei (`storage/team-N.sqlite`), die Daten bleiben sauber getrennt
  - **Automatische Übernahme:** die bisherige Datenbank wird beim ersten Aufruf zu „SV Heimstetten → U14“; alle Konten, Passwörter und Daten bleiben erhalten (alte Tabellen bleiben als `_legacy_*` zur Sicherung)
  - Trainer-Übersicht: Karte „Mannschaft“ – zwischen eigenen Mannschaften wechseln, Admins legen neue Mannschaften im Verein an
  - Ein Trainer kann in mehreren Mannschaften sein (in „Trainer hinzufügen“ den vorhandenen Benutzernamen eingeben); nach dem Anmelden öffnet sich die zuletzt gewählte Mannschaft
  - Kopfzeile und Anmeldeseite zeigen Verein · Mannschaft
  - Einrichtung (Neuinstallation, nur localhost) fragt Verein und Mannschaft ab
  - Neues Werkzeug `php tools/create_club.php` zum Freischalten neuer Vereine (und `--liste`); `create_coach.php` und die Import-Werkzeuge haben `--team=N`
  - Benutzernamen sind plattformweit eindeutig (z. B. `spieler7-2`, wenn `spieler7` schon vergeben ist)

## 0.20.1 – 2026-10-09
- Passwörter brauchen zusätzlich Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen (Beispiel: Ball-Tor-Wolke-7)

## 0.20.0 – 2026-10-09
- **Längere Passwörter:** Spieler mindestens 12 Zeichen, Trainer und Admins mindestens 14 (bisher 8). Gilt beim Festlegen und Ändern; bestehende Passwörter bleiben gültig, bis sie geändert werden.
- Die Regeln beim Passwort-Festlegen zeigen die passende Mindestlänge und den Tipp „drei Wörter mit Bindestrich“
- **Einmal-Codes nur noch 72 Stunden gültig** (bisher 7 Tage); Ablauf mit Uhrzeit

## 0.19.1 – 2026-10-08
- Modul 2v1: Fokus September–Oktober (statt November)

## 0.19.0 – 2026-10-08
- **Neues Modul „2v1 – Überzahl ausspielen“** (Fokus September–Oktober) auf der Startseite und in der Lernzone:
  - Grundlagen: Ziel, Merksatz, Prinzipien (binden, spät und flach abspielen, Abstand, früh entscheiden, fordern, nachsetzen)
  - Situationen: die vier Grundsituationen (frontal, seitlich, dahinter, Gegner im Rücken) mit Spielfeld-Skizze und Tipps, dazu „Wenn du der Verteidiger bist“
  - Übungen aus dem Training: 2v1-Rundlauf, Torabschluss-Stationen 1v0 → 1v1 → 2v1, Wellen-Spiel mit drei Teams
  - Quiz mit 10 Fragen; Lernfortschritt in „Mein Bereich“
- Inhalte in `data/modules.json` (weitere Module nach demselben Muster), Spielfeld-Ausschnitte (`view`) in `js/pitch.js`

## 0.18.1 – 2026-10-08
- Neue Grundordnung 3-1-4-2 für Aufstellungen

## 0.18.0 – 2026-10-08
- **Aufstellung:** nach der Spielauswahl zuerst die Grundordnung wählen (4-1-4-1, 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3) – das Feld zeigt leere Positionen
- Namen im Kader antippen → Position wählen (frei/belegt, passende Positionen grün markiert); „Vom Feld nehmen (Bank)“
- „Alle vom Feld“ leert alle Positionen; „Grundordnung ändern“ nimmt die Spieler mit (gleiche Position, sonst nächstgelegene freie)
- „nach Positionen füllen“ kennt jetzt auch LM, RM, ZM und 10

## 0.17.1 – 2026-10-08
- Noten: Bezeichnungen ausgeschrieben (Verhalten, Umsetzung, Einstellung, Soziales)
- Vorgabe 1: Sobald ein Trainer im Training die erste Note ändert, bekommen alle Anwesenden in allen Bereichen eine 1, die übrigen Noten passt er nur noch bei Abweichungen an

## 0.17.0 – 2026-10-08
- **IEP-Stände statt Überschreiben:** „Neuer Stand“ legt eine neue Version an, frühere bleiben erhalten und lassen sich ansehen (und bei Bedarf löschen); Spieler sehen immer den neuesten Stand. Der übernommene U13-Stand bleibt als erster Stand erhalten.
- **Bewertung nach dem Training** (nur Trainer): Schulnoten 1–6 für Verhalten, Umsetzung, Einstellung und Soziales für alle, die da waren; jeder Trainer bewertet für sich, in Klammern der Ø der anderen
- Spielerprofil (Trainer): „Bewertung im Training“ mit Ø 4 Wochen, Ø Saison und den letzten Trainings
- Neu: `api/grades.php`, Tabellen `iep_versions`, `grades`

## 0.16.1 – 2026-10-08
- Trikotnummer sitzt 2 px höher im Trikot

## 0.16.0 – 2026-10-08
- **Meine Ziele aus dem IEP** (Individueller Entwicklungsplan): Spieler sehen in „Mein Bereich“ ihr persönliches Ziel sowie Technik-, Physis-, Offensiv- und Defensivziele und den Zeitplan (ersetzt die Beispielziele)
- **Selbsteinschätzung:** bis 3 Tage nach einem Spiel bewertet der Spieler jeden Zielbereich mit 1–5 (nach Einwilligung der Eltern); der Trainer sieht Verlauf und Durchschnitt
- Trainer: Entwicklungsplan im Spielerprofil ansehen und bearbeiten; Stärken, Hauptentwicklungsfeld, psychologische Einschätzung, Gesprächsnotizen, Gruppe und Trainingshinweise **nur für Trainer** (der Server gibt sie Spielern nie heraus)
- Startstand: IEP U13 25/26 aus der Trainer-Excel übernommen (`tools/import_iep.php`, JSON ohne Namen – nicht im Repository)
- Neu: `api/iep.php`, Tabellen `iep`, `iep_ratings`

## 0.15.0 – 2026-10-08
- **Spielzeiten** (Reiter „Spielzeiten“): alle Spiele und Turniere seit Saisonbeginn aus dem Kalender
- Pro Spiel: Spielzeit (Standard 70 Min.), Ergebnis, Kader per Antippen (nicht dabei → Startelf → Bank), Startelf aus der gespeicherten Aufstellung übernehmen, Wechsel mit Minute (raus/rein, auch fliegende Wechsel mehrfach) → Minuten pro Spieler
- Saison-Übersicht: Spiele im Kader, Startelf, Einsätze, Minuten und Anteil an den möglichen Minuten – sortierbar, für faire Spielzeit
- Neu: `api/matches.php`, `js/spielzeiten.js`, Tabellen `matches`, `match_squad`, `match_subs`

## 0.14.0 – 2026-10-08
- **Taktiktafel** (Reiter „Taktik“): eigene Spieler, Gegner und Ball mit Finger oder Maus verschieben; Pässe (→), Laufwege (⇢) und Linien zeichnen; Löschen-Werkzeug; Grundordnungen „Wir 4-1-4-1“, „Gegner 4-4-2 / 4-3-3“; Beschriftung pro Figur
- **Aufstellung pro Spiel:** Spiel aus dem Kalender wählen, Spieler den Positionen zuordnen (antippen → Nummer), „nach Positionen füllen“, Startelf und Bank
- Speichern, Kopie, Löschen; **für Spieler freigeben**: Spieler sehen die Tafel auf ihrer Startseite („Vom Trainer“) – mit Positionen, aber nur ihrer eigenen Nummer (gelber Ring, „Du spielst hier: …“)
- Neu: `api/boards.php`, `js/taktik.js`, Tabelle `boards`

## 0.13.0 – 2026-10-08
- **Trainer-Startseite** mit Reitern Übersicht · Lernzone · Taktik · Spielzeiten (Lerninhalte jetzt unter „Lernzone“; Taktik und Spielzeiten folgen)
- Übersicht: die nächsten 4 Termine mit Spielerzahl (alle minus Absagen) und welche Trainer dabei sind; „Ich kann nicht“ / „Ich bin doch dabei“ für Trainer
- Übersicht: Trainingsbeteiligung aller Spieler (Prozent, Balken, Absagen der letzten 4 Wochen), sortierbar nach Nummer oder Beteiligung, Ø der Mannschaft
- **Wer nicht absagt, ist da:** Nach Trainingsende wird die Anwesenheit automatisch eingetragen (alle ohne Absage); der Trainer tippt nur noch die an, die ohne Absage gefehlt haben. Gilt für Trainings ab dem Tag der Umstellung.
- „Training fällt aus“ (zählt nicht, Spieler sehen „Fällt aus“) und „Findet doch statt“
- Neu: `api/dashboard.php`, `js/dashboard.js`, Tabelle `coach_absences`, Spalte `trainings.att_done`

## 0.12.0 – 2026-10-08
- **Training absagen:** Spieler sagen auf der Startseite oder in „Mein Bereich“ ab – mit festem Grund (Schule / Lernen, Krank, Urlaub / Familie, Sonstiges, kein Freitext), bis 2 Stunden vor Beginn (ohne Uhrzeit: bis zum Vortag); zurücknehmen mit „Ich bin doch dabei“
- Absage = „nicht da“ in der Anwesenheit (wie in der Excel); hakt der Trainer den Spieler doch ab, ist die Absage aufgehoben
- Startseite der Spieler: „Meine Trainings“ (die nächsten 3) und Trainingsbeteiligung
- Trainer: Absagen mit Grund im Training, Anzahl in der Trainingsliste; „Alle da“ lässt Abgesagte aus
- Neu: Tabelle `absences`, `api/absence.php`

## 0.11.0 – 2026-10-08
- **Bisherige Trainingsbeteiligung übernommen:** `tools/import_attendance.php` liest eine CSV (Trikotnummer; Datum; da/nicht da) – ohne Namen und ohne Abwesenheitsgründe. Trainings an Tagen ohne Kalendereintrag werden angelegt.
- **Saisonbeginn** (Trainer-Bereich → Trainer → „Saison“, nur Admin): Die Trainingsbeteiligung zählt ab diesem Tag; neue Spieler ab dem Tag ihres Kontos
- Ein Training zählt erst, wenn die Anwesenheit eingetragen ist (mindestens einer da) – nicht abgehakte Trainings drücken die Quote nicht mehr
- Training: Knöpfe „Alle da“ und „Alle zurücksetzen“
- Kalender übernimmt ein von Hand angelegtes Training am selben Tag, statt es doppelt anzulegen

## 0.10.0 – 2026-10-08
- **Mein Bereich:** „Nächster Termin“ mit Countdown und Ort, darunter Wochenübersicht Mo–So (diese / nächste Woche umschaltbar, heute markiert)

## 0.9.0 – 2026-10-08
- **Google-Kalender:** Admin fügt unter Trainer-Bereich → Trainer → „Google-Kalender“ den Einbettungs-Link (oder iframe-Code / iCal-Adresse) ein
- Alle Termine der letzten 30 und nächsten 60 Tage werden automatisch als Trainings/Spiele/Turniere/Termine angelegt und alle 15 Minuten abgeglichen (verschoben, abgesagt, gelöscht inklusive)
- Art des Termins aus dem Titel (Stichwörter in `data/team.json` → `calendar.types`)
- Startseite: „Nächster Termin“ mit Countdown, Ort mit Karten-Link, die nächsten 4 Termine; „Alle Termine“ nach Wochen
- Befindens-Barometer für Training, Spiel und Turnier (nicht für sonstige Termine); Trainingsbeteiligung zählt nur Trainings
- Trainer-Bereich: Termine aus dem Kalender mit Art und Titel; zusätzliche Trainings weiterhin von Hand
- Ist Google nicht erreichbar, zeigt die App die zuletzt geladenen Termine
- Neue Dateien: `api/calendar.php`, `api/lib/calendar.php`, `js/calendar.js`

## 0.8.0 – 2026-10-08
- **Anmeldeseite:** Mit PHP ist die ganze App erst nach Anmeldung sichtbar – Benutzername + Passwort für Spieler und Trainer
- **Erstanmeldung mit Einmal-Code:** Trainer legt Konto an → Benutzername + Code (7 Tage gültig) → Kind/Trainer legt eigenes Passwort fest
- Passwort vergessen: Trainer erzeugt einen neuen Einmal-Code (altes Passwort ungültig, alle Geräte abgemeldet)
- Passwort ändern für alle (andere Geräte werden abgemeldet); Passwort-Regeln: mind. 8 Zeichen, nicht der Benutzername, keine Allerwelts-Passwörter
- Bisherige Konten laufen weiter: Spieler `spielerNN` + alte PIN, Trainer = Vorname + alte Trainer-PIN – beim ersten Login muss ein eigenes Passwort festgelegt werden
- Sicherheit: Argon2id, CSRF-Token für jede Änderung, Sitzungs-Cookie `SameSite=Strict`, Trainer nach 8 h ohne Aktivität abgemeldet, Sperre nach 5 Fehlversuchen pro Konto, gleiche Antwort für unbekannte Benutzernamen, Sicherheits-Header (CSP, X-Frame-Options …), Demo-PINs und Projektdateien nicht über das Web abrufbar
- Kader und Daten nur noch für Angemeldete; alte PIN-Anmeldung abgeschaltet
- Trainingsbeteiligung zählt erst ab Aufnahme in den Kader
- Neue Dateien: `js/auth.js`, `api/auth.php`, `api/accounts.php`, `tools/create_coach.php`

## 0.7.0 – 2026-10-08
- Trainer-Konten: jeder Trainer meldet sich mit Namen und eigener 6-stelliger PIN an; Admins legen Trainer an, vergeben/entziehen Admin-Rechte, entfernen Konten (mindestens ein Admin bleibt immer)
- Die bisherige Trainer-PIN wird automatisch zum Admin-Konto „Trainer“ (Name unter „Trainer“ änderbar)
- Trainer-Bereich mit Reitern Kader · Trainings · Trainer
- Spielerprofil (Vorname, Nachname, Geburtstag, Schulschluss, starker Fuß, Wunschposition, Vorbild, Saisonziel, Größen) – sichtbar nur für das Kind und die Trainer
- Einwilligung der Eltern pro Spieler: erst danach sind Profil und Befindens-Barometer freigeschaltet
- Trainings anlegen, Anwesenheit per Antippen; jedes Kind sieht seine Trainingsbeteiligung als Punktezeile mit Prozent
- Befindens-Barometer vor (Laune, Schlaf, Energie, „nicht fit“) und nach jedem Training (Belastung 1–10), freiwillige Nachricht an den Trainer
- Trainer-Übersicht: Ø Laune und Belastung pro Training, Hinweise „bitte ansprechen“ (nicht fit oder zweimal schlechte Laune), roter Punkt im Kader
- Admins können Spieler mit allen Daten löschen
- Sicherheit: Sperre nach 5 falschen PINs jetzt pro Konto in der Datenbank (auch wenn Cookies gelöscht werden)
- Code aufgeteilt: `js/me.js` (Spieler), `js/coach.js` (Trainer)

## 0.6.0 – 2026-10-08
- Jeder Spieler hat eine offensivere und eine defensivere Position (Trikotnummern sagen nichts über die Position aus)
- Trainer-Modus: Positionen beim Anlegen und unter „Kader verwalten“ festlegen; Kader zeigt die Positionen unter den Trikots
- Mein Bereich zeigt beide Positionen
- Spielsituationen mit Positionskürzeln statt Nummern (4-1-4-1), eigene Positionen mit gelbem Ring markiert
- Phase 1: neue Situation „Abstoß“ nach unserem Spielaufbau, drei neue Quizfragen dazu
- Positionsliste in `data/team.json`, Datenbank wird automatisch um die neuen Spalten ergänzt

## 0.5.0 – 2026-10-08
- Trainer-Modus „Kader verwalten“: alle Trikots, Antippen → neue PIN vergeben (auch zufällig), alte PIN gilt danach nicht mehr
- Einstieg über „Trainer: Kader verwalten“ unter der Nummernwahl oder über das graue „+“-Trikot
- Neue Spielphase 5 „Standards“ (ruhender Ball): Grundlagen, Eckball-Situation, 5 Prinzipien, Quiz mit 5 Fragen
- Korrektur: Bei falscher PIN erscheint wieder „PIN stimmt nicht“ statt „Server nicht erreichbar“

## 0.4.0 – 2026-10-08
- Neue Spieler anlegen: graues „+“-Trikot in der Nummernwahl → Torwart (blau) oder Feldspieler (rot), Trikotnummer und 4-stellige PIN (auch zufällig)
- Nur für Trainer: 6-stellige Trainer-PIN, beim ersten Mal auf XAMPP direkt in der App festlegen
- Kader kommt mit PHP aus der Datenbank (`api/players.php`), Trikotfarbe richtet sich nach Torwart/Feldspieler
- `js/config.js` erkennt automatisch, ob PHP läuft (`mode: "auto"`); ohne PHP läuft die App wie bisher
- Datenbank wird beim ersten Aufruf automatisch angelegt und auf XAMPP mit dem Demo-Kader (PIN 1234) befüllt

## 0.3.2 – 2026-10-08
- Umlaute auf eigenem Server (XAMPP) korrigiert: `index.html` als vollständiges HTML-Dokument mit UTF-8, `.htaccess` mit `AddDefaultCharset UTF-8`

## 0.3.1 – 2026-10-08
- Projekt auf GitHub: Dateien liegen im Hauptverzeichnis, `.gitignore` und `.htaccess` (Schutz für `storage/` und `tools/`) ergänzt

## 0.3.0 – 2026-10-08
- Projekt in Dateien aufgeteilt: Inhalte in `data/*.json`, Oberfläche in `js/app.js`, Datenzugriff in `js/store.js`
- Umschalter Weg A / Weg B in `js/config.js`
- PHP-Schnittstelle für echten Login (`api/`), Datenbankschema und Kader-Import (`tools/`)
- Versionsnummer in der App angezeigt

## 0.2.0 – 2026-10-08
- Torhüter-Trikots 1 und 22 in Blau (#2E78FF), 22 als zweiter Torhüter angelegt

## 0.1.0 – 2026-10-08
- Erster Entwurf: Spielfeld & Zonen (Entdecken, Finden, Benennen), 4 Spielphasen mit Grundlagen, Lernmaterial und Quiz
- Mein Bereich mit Trikotnummer + PIN, Wochenplan, Zielen und Lernfortschritt
