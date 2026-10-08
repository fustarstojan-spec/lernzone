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
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  date  TEXT NOT NULL,                               -- 'YYYY-MM-DD'
  time  TEXT NOT NULL DEFAULT '',                    -- 'HH:MM'
  note  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attendance (
  training_id  INTEGER NOT NULL,
  nr           INTEGER NOT NULL,
  PRIMARY KEY (training_id, nr)
);

CREATE TABLE IF NOT EXISTS moods (
  training_id  INTEGER NOT NULL,
  nr           INTEGER NOT NULL,
  phase        TEXT    NOT NULL,                     -- 'vor' oder 'nach'
  data         TEXT    NOT NULL,                     -- JSON: vor {laune, schlaf, energie, nichtfit, kommentar}, nach {rpe, kommentar}
  created_at   TEXT    NOT NULL,
  PRIMARY KEY (training_id, nr, phase)
);
