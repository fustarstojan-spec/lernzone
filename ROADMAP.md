# Planungsliste Lernzone

Ideen und Vorhaben, damit nichts verloren geht. Was fertig ist, steht im `CHANGELOG.md`.
Pflege: neue Ideen hier eintragen, Erledigtes streichen und ins CHANGELOG übernehmen.

## Offen beim Trainer (zu klären / einzutragen)

- [ ] GitHub-Repository auf **privat** stellen (alter Commit 2bce770 enthält noch Namen von Kindern)
- [ ] Impressum und Betreiber in der App eintragen (Verwaltung → Impressum und Betreiber)
- [ ] Datenschutz-Angaben des Vereins eintragen (offizieller Name, Anschrift, Vorstand, E-Mail)
- [ ] Buch-Übungen prüfen (Entwürfe): 2v1 Doppelaktion, Aus Passformen ins 2v1, 2v1 Rolle (Coachingpunkte von Claude)
- [ ] „Abschluss gegen eine Viererkette“: Nummern 3/7/9/10/11 durch Positionskürzel ersetzen?
- [ ] Dauer bei 4 Übungen ergänzen
- [ ] IEP: Zuordnung Nr. 18 bestätigen; Nr. 20 und Nr. 23 haben noch keinen IEP
- [ ] Plattformname festlegen

## Als Nächstes (besprochen)

1. **Zeichen-Editor für Übungsskizzen** im Stil der bisherigen Bilder: gestreifter Rasen, Spieler Rot/Blau/Gelb/Grün, TW, Hütchen, Dummy, Minitor, Großtor, Leiter, Minihürde, Ball; Pass (durchgezogen), Laufweg (gestrichelt), Dribbling (Welle), Korridore/Zonen, Beschriftungen, Schrittnummern; Legende automatisch; „Als Bild der Übung speichern“
2. **Registrierung (Schritt 2):** Verein beantragt Zugang, Superadmin schaltet frei
3. **Online gehen (Schritt 3):** Hosting in Deutschland mit HTTPS (ideal Vereins-Subdomain), AVV-Vorlage für Vereine, Datenschutz/Impressum rechtlich prüfen lassen

## Sicherheit und Betrieb

- [x] ~~Bremse pro IP-Adresse beim Anmelden~~ (0.25.0)
- [x] ~~Sicherheitsprotokoll~~ (0.25.0)
- [ ] Projektdateien sperren, die von außen abrufbar sind: `tools/*.sql`, `data/demo-pins.json` (auf dem Server weglassen), `ROADMAP.md`, `api/lib/`
- [ ] Unabhängiger Sicherheitscheck (Code-Prüfung) vor dem Online-Gehen
- [ ] Beim Hosting prüfen, ob die echte Besucher-IP ankommt (Proxy) – sonst sperrt die IP-Bremse alle
- [ ] Optional: E-Mail an Superadmin bei Alarmen (Netz gesperrt, viele Fehlversuche)

- [ ] Datenbanken außerhalb des Web-Ordners, automatische Backups
- [ ] HSTS, optional 2FA für Admins
- [ ] Benutzerverwaltung: Konten sperren/entsperren, „überall abmelden“ (Protokoll seit 0.25.0)
- [ ] Automatisches Löschen alter Daten (z. B. Barometer nach Saisonende) – Datenschutztext dann anpassen

## Inhalte (vom Trainer)

- [ ] Spielidee: Ballbesitz als Basis, TW als Feldspieler, Gegenpressing 5–8 Sek. („Der Nächste ist der Erste“), hohe Linie, 3-Spieler-Regel im Strafraum, Mut zum Abschluss
- [ ] Defensiv-Grundsätze: KAI, BMG, Zentrum dicht, Ballfern drücken, FAA
- [ ] Angriffspressing: Mitte zu – Tiefe zu, Druck auf den Ball, Überzahl durch Deckungsschatten, im Sprint anlaufen, Nachverteidigen
- [ ] „Fokus des Monats“ aus dem Saisonplan (Startseite und Trainingsplanung)
- [ ] Weitere Module nach dem 2v1-Modul
- [ ] Inhalte je Verein (eigene Phasen/Module statt gleicher `data/*.json` für alle)

## Ideen (noch nicht besprochen)

- [ ] Namen der Spieler durch den Trainer eintragen (bisher nur über das Profil des Kindes) – dann zeigen Teilnehmerlisten Namen statt nur Nummern
- [ ] Übungen ebenfalls einem Schwerpunkt aus der Spielphasen-Referenz zuordnen und danach filtern

- [ ] Eltern-Zugang; Einwilligung digital statt Papier
- [ ] Lernfortschritt aller Spieler in der Trainer-Ansicht
- [ ] Individuelle Pläne pro Spieler
- [ ] Spieler sehen ihre Spielzeiten
- [ ] Trainingsplan (vereinfacht) für Spieler sichtbar, z. B. „Heute: 2v1“
- [ ] Übungen zwischen Vereinen teilen (freiwillig)
