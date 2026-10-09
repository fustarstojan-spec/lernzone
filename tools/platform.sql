-- Lernzone Plattform-Datenbank (ab 0.21.0): Vereine, Mannschaften, Zugänge, Trainer, Mitgliedschaften
-- Jede Mannschaft hat ihre eigene Datenbank-Datei (tools/schema.sql), die hier über teams.db_file gefunden wird.

CREATE TABLE IF NOT EXISTS clubs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL,                       -- z. B. „U14“
  season      TEXT    NOT NULL DEFAULT '',            -- z. B. „2026/27“
  db_file     TEXT    NOT NULL UNIQUE,                -- Datei im Ordner storage/
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  kind          TEXT    NOT NULL,                    -- 'player' oder 'coach'
  ref           INTEGER NOT NULL,                    -- Trainer: coaches.id · Spieler: Trikotnummer im ersten Team (Nummer pro Team: memberships.ref)
  pw_hash       TEXT    NOT NULL DEFAULT '',         -- eigenes Passwort (Argon2id/bcrypt)
  code_hash     TEXT    NOT NULL DEFAULT '',         -- Einmal-Code vom Trainer (Hash)
  code_expires  INTEGER NOT NULL DEFAULT 0,          -- Unix-Zeit
  must_set_pw   INTEGER NOT NULL DEFAULT 1,          -- 1 = beim nächsten Login eigenes Passwort festlegen
  active        INTEGER NOT NULL DEFAULT 1,
  sess_ver      INTEGER NOT NULL DEFAULT 0,          -- erhöht = alle Sitzungen dieses Kontos ungültig
  fail_count    INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  last_login    TEXT    NOT NULL DEFAULT '',
  platform_admin INTEGER NOT NULL DEFAULT 0,         -- Superadmin: legt Vereine und Vereinsadmins an (sieht keine Mannschaftsdaten)
  last_team     INTEGER NOT NULL DEFAULT 0,          -- zuletzt gewählte Mannschaft
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS accounts_kref ON accounts (kind, ref);

-- Wer gehört zu welcher Mannschaft – und in welcher Rolle
CREATE TABLE IF NOT EXISTS memberships (
  account_id  INTEGER NOT NULL,
  team_id     INTEGER NOT NULL,
  role        TEXT    NOT NULL,                       -- 'player' | 'coach'
  ref         INTEGER NOT NULL,                       -- Spieler: Trikotnummer in diesem Team · Trainer: coaches.id
  is_admin    INTEGER NOT NULL DEFAULT 0,             -- Trainer: Cheftrainer dieser Mannschaft (verwaltet Co-Trainer, löscht Spieler)
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, team_id)
);
CREATE INDEX IF NOT EXISTS memberships_team ON memberships (team_id, role, ref);

-- Vereinsadmins (ab 0.22.0): legen Mannschaften an, laden Trainer ein, sehen alle Mannschaften ihres Vereins
CREATE TABLE IF NOT EXISTS club_admins (
  account_id  INTEGER NOT NULL,                       -- Trainer-Konto (kind 'coach')
  club_id     INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, club_id)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  name   TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
