# Projekt: Heimstetten Lernzone

Lern-App für die U14 des SV Heimstetten. Die Kinder wiederholen, was im Training gelernt wird (Spielphasenmodell), sehen ihren persönlichen Bereich, und das Trainerteam verwaltet Kader, Trainings und Befinden.
Sprache: Deutsch. Antworten kurz und direkt.

## Arbeitsweise (vereinbart)

1. Änderungen zuerst **lokal** im XAMPP-Ordner `C:\xampp\htdocs\lernzone` (Test unter `http://localhost/lernzone`, Neuladen mit Strg + F5).
2. Erst wenn der Trainer **„hochladen“** schreibt: Commit(s) auf GitHub pushen → `fustarstojan-spec/lernzone` (öffentlich). Vorher nicht pushen.
3. Jede Änderung: Version in `js/app.js` (`APP_VERSION`) erhöhen und in `CHANGELOG.md` eintragen (PATCH = Korrektur, MINOR = neue Funktion/Inhalte).
4. Vor dem Ausliefern testen (PHP-Server + Browser), auch mit einer **alten Datenbank** (Migration).
5. Größere Vorhaben erst besprechen, dann bauen.

## Aufbau

- Statisches Frontend: `index.html`, `css/app.css`, `js/*.js` (kein Build-Schritt, keine Bibliotheken).
  - `js/config.js` – `mode: "auto"` erkennt, ob PHP läuft (Weg B) oder nicht (Weg A, nur Browser).
  - `js/store.js` – einziger Datenzugriff (LocalStore / ApiStore).
  - `js/app.js` – Kern: Startseite, Phasen, Quiz, Zonen, Anmeldung, Mein Bereich; Erweiterungs-Schnittstelle `window.LZ` (views, actions, inputs, hooks).
  - `js/me.js` – Spieler: Trainingsbeteiligung, Befindens-Barometer, Profil.
  - `js/coach.js` – Trainer-Bereich: Kader, Trainings, Trainer-Konten.
  - `js/dashboard.js` – Trainer-Startseite (Übersicht) und Reiter-Navigation `LZ.coachNav()`.
  - `js/taktik.js` – Taktiktafel und Aufstellungen (Trainer), freigegebene Tafeln (Spieler).
  - `js/spielzeiten.js` – Spielzeiten pro Spiel und Saison (Trainer).
  - `js/pitch.js` – Spielfeld-SVG (68 × 105 m, Angriff nach oben, 5 Spuren × 3 Drittel).
- Inhalte in `data/*.json` (Phasen, Quiz, Pläne, Positionen, Kader ohne PINs). Quizfrage: `{ q, options, correct, why }`.
- Backend: PHP 8.1+ in `api/`, SQLite in `storage/lernzone.sqlite` (nie ins Repo), Schema `tools/schema.sql`, Migration in `api/config.php → migrate()`.
- Anmeldung (Weg B, ab 0.8.0): Benutzername + Passwort für alle, Tabelle `accounts` (kind player/coach, ref = Trikotnummer bzw. Trainer-ID). Neue Konten bekommen einen Einmal-Code (72 Stunden), danach eigenes Passwort. `js/auth.js` + `api/auth.php`, Zugänge verwalten in `api/accounts.php`.
- Rollen: Spieler, Trainer, Admin (verwaltet Trainer, erzeugt Trainer-Codes, löscht Spieler). Weg A (ohne PHP, z. B. Claude-Vorschau) nutzt weiterhin Trikot + Demo-PIN.
- Google-Kalender (ab 0.9.0): Admin speichert Einbettungs-Link/iCal-Adresse (Tabelle settings), `api/lib/calendar.php` liest iCal (Cache 15 Min) und legt alle Termine als Zeilen in `trainings` an (Spalten kind, title, location, end_time, cal_key). Art per Stichwort aus `data/team.json → calendar.types`. Trainingsbeteiligung zählt nur kind = training.
- Sicherheit: Passwort mind. 12 Zeichen (Trainer/Admin 14) mit Groß-/Kleinbuchstabe, Zahl, Sonderzeichen ( `PW_MIN_*` in `api/config.php`), Einmal-Code 72 Std. (`CODE_HOURS`), Argon2id, CSRF-Token (Header `X-CSRF-Token`), SameSite=Strict, Sperre pro Konto, Trainer-Timeout 8 h, Sitzungs-Version pro Konto, Sicherheits-Header in `.htaccess`.

## Fachliches

- Spielphasenmodell: 1 Eigener Ballbesitz · 2 Umschalten nach Ballverlust · 3 Gegnerischer Ballbesitz · 4 Umschalten nach Ballgewinn (Kreislauf) · 5 Standards (eigene Karte, Spielunterbrechung).
- Grundordnung 4-1-4-1. Positionskürzel: TW · RV · IV · LV · 6 · 8 · RA · LA · ST (`data/team.json`).
- **Trikotnummern sagen nichts über die Position aus.** Jeder Spieler hat eine offensivere und eine defensivere Position (vom Trainer gesetzt).
- Spielsituationen zeigen Positionskürzel; die Positionen des angemeldeten Kindes bekommen einen gelben Ring.
- Abstoß-Aufbau (Phase 1): TW linkes Fünfereck, ein IV rechtes Fünfereck, beide 8er auf gleicher Höhe in den Außenspuren, zweiter IV und 6 an der Strafraumgrenze (Grenze Zentrum/Halbspur), AV schieben hoch, ST lässt sich im Zentrum fallen, Außenstürmer jenseits der Mittellinie an der Grenze Zentrum/Halbspur.
- Trikotfarben: Feldspieler weinrot `#5e2129`, Torwart blau `#2E78FF`, Nummer weiß.
- Noch einzubauen (Inhalte des Trainers): Spielidee (Ballbesitz als Basis, TW als Feldspieler, Gegenpressing 5–8 Sek. „Der Nächste ist der Erste“, hohe Linie, 3-Spieler-Regel im Strafraum, Mut zum Abschluss), Defensiv-Grundsätze (KAI, BMG, Zentrum dicht, Ballfern drücken, FAA), Angriffspressing (Mitte zu – Tiefe zu, Druck auf den Ball, Überzahl durch Deckungsschatten, Im Sprint anlaufen, Nachverteidigen), „Fokus des Monats“ aus dem Saisonplan.

## Datenschutz (Entscheidungen)

- Kinder sehen untereinander nichts voneinander (keine Social-Media-Funktionen).
- Profil und Befindens-Barometer erst nach Einwilligung der Eltern (Trainer setzt das Häkchen).
- Keine Gesundheitsdetails; „nicht fit“ ist nur ein Hinweis an den Trainer.
- Keine Namen von Kindern im Repository oder in `data/`. Echte PINs nur als Hash in der Datenbank.
- Sperre nach 5 falschen PINs pro Konto (Datenbank) und pro Sitzung.

## Stand und nächste Schritte

- Aktuell: Version 0.22.0 (siehe `CHANGELOG.md`). 0.22.0 liegt lokal, noch nicht auf GitHub.
- Mehrere Vereine (ab 0.21.0, Schritt 1 von 3): `storage/platform.sqlite` (Schema `tools/platform.sql`: clubs, teams, accounts, coaches, memberships) + eine Datei pro Mannschaft (`teams.db_file`; Team 1 = `lernzone.sqlite`). `db()` öffnet die Datei der gewählten Mannschaft (`$_SESSION['team']`) und hängt die Plattform als `p` an – `accounts`/`coaches`/`memberships` daher immer über `pdb()` schreiben. Rolle und Cheftrainer gelten pro Mannschaft (`memberships.is_admin`). Übernahme der Altdaten in `platform_bootstrap()`, Ergänzungen in `platform_migrate()`. Werkzeuge: `tools/create_club.php`, `--team=N`.
- Rollen (ab 0.22.0): Superadmin (`accounts.platform_admin`, Vereine + Vereinsadmins, **keine Mannschaftsdaten**) · Vereinsadmin (Tabelle `club_admins`, legt Mannschaften an, lädt Trainer ein, sieht/öffnet alle Mannschaften seines Vereins mit vollen Rechten – vom Trainer so gewollt, er ist hauptverantwortlich für die Ausbildung) · Cheftrainer (`memberships.is_admin`) · Trainer · Spieler. Mannschaften legt nur der Vereinsadmin an. Verwaltung: `api/admin.php` + `js/admin.js` (Reiter „Verwaltung“). Offen: Schritt 2 Registrierung (zunächst Freischaltung durch den Superadmin), Schritt 3 Rechtliches/Hosting; Plattformname noch offen; Inhalte (`data/*.json`) noch für alle gleich.
- Module (ab 0.19.0): `data/modules.json` – eigene Lerneinheiten neben den Phasen (Tabs Grundlagen · Situationen · Übungen · Quiz, Ansicht `modul` in `js/app.js`). Erstes Modul: 2v1 (Inhalte aus den Trainer-Chats „2v1 Rundlauf“ und Stationen-Training). Buch-Übungen (2v1 Doppelaktion, Aus Passformen ins 2v1, 2v1 Rolle) fehlen noch – nur mit eigenen Worten des Trainers einbauen.
- IEP (ab 0.16.0): Quelle sind die IEP-Dateien des Trainers im Google Drive (U13_IEP_v2.xlsx, Individueller Entwicklungsplan.pdf, Saison 25/26). Tabelle `iep` (data JSON: goals ind/tech/phys/off/def, plan short/mid/long, season, coach{…}), `iep_ratings` (Selbsteinschätzung 1–5 pro Spiel und Bereich, bis 3 Tage danach, nur mit Einwilligung). `coach`-Teil (inkl. psychologischer Einschätzung) nur für Trainer – `api/iep.php` gibt Spielern nur goals/plan/season. Zuordnung über Trikotnummer (Nr. 18 vom Trainer zu bestätigen); Nr. 20 und Nr. 23 haben noch keinen IEP.
- IEP-Stände (ab 0.17.0): Tabelle `iep_versions` (jedes Speichern = neue Version, neueste gilt; alte Tabelle `iep` nur noch Altbestand). Trainer-Noten nach dem Training: Tabelle `grades` (training_id, nr, coach_id, area verhalten/umsetzung/einstellung/soziales, value 1–6), jeder Trainer einzeln, Vorgabe 1 (wird beim ersten Eintrag eines Trainers für alle Anwesenden gesetzt), **nur für Trainer** – nie an Spieler ausgeben.
- Anwesenheit (ab 0.13.0): Wer nicht absagt, ist da. `trainings.att_done` 0 offen / 1 erfasst / 2 fällt aus; `att_autofill()` schreibt nach Trainingsende fest (nur Trainings ab `settings.auto_att_from`). Beteiligung zählt nur att_done = 1.
- Trainer-Startseite (ab 0.13.0): `js/dashboard.js` + `api/dashboard.php`, Reiter Übersicht · Lernzone · Taktik · Spielzeiten. Trainer sagen Termine ab (`coach_absences`).
- Taktiktafel (ab 0.14.0): `js/taktik.js` + `api/boards.php`, Tabelle `boards` (kind board/lineup, training_id = Spiel, shared, data JSON in Metern). Freigegebene Tafeln: Spieler sehen nur ihre eigene Nummer (Server blendet andere aus). Aufstellungen (ab 0.18.0): erst Grundordnung wählen (`FORMATIONS` in `js/taktik.js`, `data.formation`), leere Positionen, Spieler per Namen → Position.
- Spielzeiten (ab 0.15.0): `js/spielzeiten.js` + `api/matches.php`, Tabellen `matches` (Dauer, Ergebnis), `match_squad` (starter 1/0), `match_subs` (minute, nr_out, nr_in). Minuten werden immer aus Startelf + Wechseln berechnet (`match_minutes()`), nie gespeichert. Spieler sehen ihre Spielzeiten (noch) nicht.
- Absagen (ab 0.12.0): Spieler sagen Trainings ab (nur kind = training), fester Grund ohne Freitext, bis 2 Std. vorher; Tabelle `absences`; Absage zählt als „nicht da“.
- Trainingsbeteiligung: bis 07.10.2026 aus der Excel des Trainers übernommen (nur „ja“ zählt), Saisonbeginn 30.06.2026; ab jetzt wird in der App abgehakt. Zählt nur Trainings mit eingetragener Anwesenheit.
- Mannschaftskalender ist ein öffentlicher Google-Kalender; die Adresse steht nur in der Datenbank (nicht im Repo).
- Entschieden: Benutzernamen vergibt der Trainer (Vorschlag `vorname.n`), ganze App hinter Login, Eltern-Zugang und 2FA später.
- Nächste Schritte Weg B:
  - Benutzerverwaltung ausbauen: Konten sperren/entsperren, Protokoll (wer hat wann was geändert), „überall abmelden“.
  - Härtung für den echten Server: DB außerhalb des Web-Ordners, Backups, HSTS, optional 2FA für Admins.
  - Hosting in Deutschland mit HTTPS (ideal Vereins-Subdomain), AVV, Datenschutzerklärung/Impressum mit dem Verein klären.
- Weitere Ideen: Einwilligungsformular für Eltern, Abwesenheit melden, Lernfortschritt aller Spieler in der Trainer-Ansicht, individuelle Pläne pro Spieler.
