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
  - `js/pitch.js` – Spielfeld-SVG (68 × 105 m, Angriff nach oben, 5 Spuren × 3 Drittel).
- Inhalte in `data/*.json` (Phasen, Quiz, Pläne, Positionen, Kader ohne PINs). Quizfrage: `{ q, options, correct, why }`.
- Backend: PHP 8.1+ in `api/`, SQLite in `storage/lernzone.sqlite` (nie ins Repo), Schema `tools/schema.sql`, Migration in `api/config.php → migrate()`.
- Rollen: Spieler (Trikotnummer + 4-stellige PIN), Trainer (Name + 6-stellige PIN), Admin (verwaltet Trainer, löscht Spieler).

## Fachliches

- Spielphasenmodell: 1 Eigener Ballbesitz · 2 Umschalten nach Ballverlust · 3 Gegnerischer Ballbesitz · 4 Umschalten nach Ballgewinn (Kreislauf) · 5 Standards (eigene Karte, Spielunterbrechung).
- Grundordnung 4-1-4-1. Positionskürzel: TW · RV · IV · LV · 6 · 8 · RA · LA · ST (`data/team.json`).
- **Trikotnummern sagen nichts über die Position aus.** Jeder Spieler hat eine offensivere und eine defensivere Position (vom Trainer gesetzt).
- Spielsituationen zeigen Positionskürzel; die Positionen des angemeldeten Kindes bekommen einen gelben Ring.
- Abstoß-Aufbau (Phase 1): TW linkes Fünfereck, ein IV rechtes Fünfereck, beide 8er auf gleicher Höhe in den Außenspuren, zweiter IV und 6 an der Strafraumgrenze (Grenze Zentrum/Halbspur), AV schieben hoch, ST lässt sich im Zentrum fallen, Außenstürmer jenseits der Mittellinie an der Grenze Zentrum/Halbspur.
- Trikotfarben: Feldspieler weinrot `#5e2129`, Torwart blau `#2E78FF`, Nummer weiß.
- Noch einzubauen (Inhalte des Trainers): Spielidee (Ballbesitz als Basis, TW als Feldspieler, Gegenpressing 5–8 Sek. „Der Nächste ist der Erste“, hohe Linie, 3-Spieler-Regel im Strafraum, Mut zum Abschluss), Defensiv-Grundsätze (KAI, BMG, Zentrum dicht, Ballfern drücken, FAA), Angriffspressing (Mitte zu – Tiefe zu, Druck auf den Ball, Überzahl durch Deckungsschatten, Im Sprint anlaufen, Nachverteidigen), Modul „2v1 / Überzahl ausspielen“, „Fokus des Monats“ aus dem Saisonplan.

## Datenschutz (Entscheidungen)

- Kinder sehen untereinander nichts voneinander (keine Social-Media-Funktionen).
- Profil und Befindens-Barometer erst nach Einwilligung der Eltern (Trainer setzt das Häkchen).
- Keine Gesundheitsdetails; „nicht fit“ ist nur ein Hinweis an den Trainer.
- Keine Namen von Kindern im Repository oder in `data/`. Echte PINs nur als Hash in der Datenbank.
- Sperre nach 5 falschen PINs pro Konto (Datenbank) und pro Sitzung.

## Stand und nächste Schritte

- Aktuell: Version 0.7.0 (siehe `CHANGELOG.md`). 0.4.0–0.7.0 liegen lokal, noch nicht auf GitHub.
- Nächster großer Schritt: **Weg B mit echter Benutzerverwaltung**
  - Anmeldeseite als Eingang, Login mit Benutzername + Passwort, Erstanmeldung mit Einmal-Code und eigenem Passwort.
  - Eine Tabelle `users` (Rollen Spieler/Trainer/Admin), Admin-Benutzerverwaltung mit Protokoll.
  - Härtung: Argon2id, CSRF-Schutz, Session-Timeouts, Sicherheits-Header, DB außerhalb des Web-Ordners, Backups, optional 2FA für Admins.
  - Hosting in Deutschland mit HTTPS (ideal Vereins-Subdomain), AVV, Datenschutzerklärung/Impressum mit dem Verein klären.
  - Offene Entscheidungen: Schema für Benutzernamen, ganze App hinter Login?, Eltern-Zugang?, 2FA sofort?
- Weitere Ideen: Einwilligungsformular für Eltern, Abwesenheit melden, Lernfortschritt aller Spieler in der Trainer-Ansicht, individuelle Pläne pro Spieler.
