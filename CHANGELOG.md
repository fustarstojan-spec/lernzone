# Änderungsprotokoll

Format: `MAJOR.MINOR.PATCH` – PATCH = Korrektur, MINOR = neue Inhalte oder Funktionen, MAJOR = großer Umbau (z. B. Weg B live).

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
