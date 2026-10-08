# Änderungsprotokoll

Format: `MAJOR.MINOR.PATCH` – PATCH = Korrektur, MINOR = neue Inhalte oder Funktionen, MAJOR = großer Umbau (z. B. Weg B live).

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
