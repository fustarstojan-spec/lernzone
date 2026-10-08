-- Lernzone – Datenbankschema (SQLite; für MySQL: INTEGER → INT, TEXT → VARCHAR/JSON, AUTOINCREMENT → AUTO_INCREMENT)
-- Wird bei jedem Aufruf mit IF NOT EXISTS ausgeführt; neue Spalten für alte Datenbanken ergänzt api/config.php → migrate().

CREATE TABLE IF NOT EXISTS players (
  nr            INTEGER PRIMARY KEY,                 -- Trikotnummer = Spieler-ID
  pos           TEXT    NOT NULL,                    -- 'Tor' oder 'Feldspieler'
  plan          TEXT    NOT NULL DEFAULT 'feld',     -- 'tw' = Torwart (blaues Trikot), 'feld' = Feldspieler
  pos_off       TEXT    NOT NULL DEFAULT '',         -- offensivere Position, z. B. 'RA'
  pos_def       TEXT    NOT NULL DEFAULT '',         -- defensivere Position, z. B. 'RV'
  pin_hash      TEXT    NOT NULL,                    -- password_hash(), niemals die PIN im Klartext
  active        INTEGER NOT NULL DEFAULT 1,
  consent       INTEGER NOT NULL DEFAULT 0,          -- 1 = Einwilligung der Eltern liegt vor (Profil + Befinden frei)
  fail_count    INTEGER NOT NULL DEFAULT 0,          -- Fehlversuche beim Login
  locked_until  INTEGER NOT NULL DEFAULT 0           -- Unix-Zeit, bis wann der Login gesperrt ist
);

CREATE TABLE IF NOT EXISTS progress (
  nr          INTEGER PRIMARY KEY,
  data        TEXT    NOT NULL,                      -- JSON: {quiz:{}, tasks:{}}
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  name   TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coaches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,                    -- Vorname des Trainers, wird bei der Anmeldung angezeigt
  pin_hash      TEXT    NOT NULL,                    -- 6-stellige Trainer-PIN (Hash)
  is_admin      INTEGER NOT NULL DEFAULT 0,          -- Admin: verwaltet Trainer und darf Spieler löschen
  active        INTEGER NOT NULL DEFAULT 1,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profiles (
  nr          INTEGER PRIMARY KEY,                   -- Spieler
  data        TEXT    NOT NULL,                      -- JSON: Vorname, Nachname, Geburtstag, Schulschluss …
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS trainings (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL,                           -- 'YYYY-MM-DD'
  time      TEXT NOT NULL DEFAULT '',                -- 'HH:MM' ('' = ganztägig)
  note      TEXT NOT NULL DEFAULT '',
  end_time  TEXT NOT NULL DEFAULT '',                -- ab 0.9.0
  title     TEXT NOT NULL DEFAULT '',                -- Titel aus dem Kalender
  kind      TEXT NOT NULL DEFAULT 'training',        -- 'training' | 'spiel' | 'turnier' | 'termin'
  location  TEXT NOT NULL DEFAULT '',
  cal_key   TEXT NOT NULL DEFAULT '',                -- '' = von Hand angelegt, sonst Termin-Schlüssel aus dem Google-Kalender
  att_done  INTEGER NOT NULL DEFAULT 0               -- ab 0.13.0: 0 = Anwesenheit offen, 1 = erfasst, 2 = Training fällt aus
);

CREATE TABLE IF NOT EXISTS attendance (
  training_id  INTEGER NOT NULL,
  nr           INTEGER NOT NULL,
  PRIMARY KEY (training_id, nr)
);

-- Absagen der Spieler (ab 0.12.0): nur ein fester Grund, kein Freitext (Datenschutz)
CREATE TABLE IF NOT EXISTS absences (
  training_id  INTEGER NOT NULL,
  nr           INTEGER NOT NULL,
  reason       TEXT    NOT NULL,                     -- schule | krank | urlaub | sonst
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (training_id, nr)
);

-- Trainer, die bei einem Termin nicht können (ab 0.13.0)
CREATE TABLE IF NOT EXISTS coach_absences (
  training_id  INTEGER NOT NULL,
  coach_id     INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (training_id, coach_id)
);

-- Taktiktafel und Aufstellungen (ab 0.14.0)
CREATE TABLE IF NOT EXISTS boards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL DEFAULT '',
  kind         TEXT    NOT NULL DEFAULT 'board',     -- 'board' = freie Taktiktafel, 'lineup' = Aufstellung für ein Spiel
  training_id  INTEGER,                              -- Spiel (trainings.id) bei Aufstellungen
  shared       INTEGER NOT NULL DEFAULT 0,           -- 1 = für Spieler sichtbar
  data         TEXT    NOT NULL DEFAULT '{}',        -- {items:[…], lines:[…]}  Maße in Metern
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by   INTEGER
);

CREATE TABLE IF NOT EXISTS moods (
  training_id  INTEGER NOT NULL,
  nr           INTEGER NOT NULL,
  phase        TEXT    NOT NULL,                     -- 'vor' oder 'nach'
  data         TEXT    NOT NULL,                     -- JSON: vor {laune, schlaf, energie, nichtfit, kommentar}, nach {rpe, kommentar}
  created_at   TEXT    NOT NULL,
  PRIMARY KEY (training_id, nr, phase)
);

-- Zugänge (ab 0.8.0): Anmeldung mit Benutzername + Passwort für Spieler und Trainer
CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  kind          TEXT    NOT NULL,                    -- 'player' oder 'coach'
  ref           INTEGER NOT NULL,                    -- players.nr bzw. coaches.id
  pw_hash       TEXT    NOT NULL DEFAULT '',         -- eigenes Passwort (Argon2id/bcrypt)
  code_hash     TEXT    NOT NULL DEFAULT '',         -- Einmal-Code vom Trainer (Hash)
  code_expires  INTEGER NOT NULL DEFAULT 0,          -- Unix-Zeit
  must_set_pw   INTEGER NOT NULL DEFAULT 1,          -- 1 = beim nächsten Login eigenes Passwort festlegen
  active        INTEGER NOT NULL DEFAULT 1,
  sess_ver      INTEGER NOT NULL DEFAULT 0,          -- erhöht = alle Sitzungen dieses Kontos ungültig
  fail_count    INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  last_login    TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_ref ON accounts (kind, ref);
