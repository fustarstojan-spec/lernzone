-- Lernzone – Datenbankschema (SQLite; für MySQL: INTEGER → INT, TEXT → VARCHAR/JSON)
CREATE TABLE IF NOT EXISTS players (
  nr        INTEGER PRIMARY KEY,          -- Trikotnummer = Spieler-ID
  pos       TEXT    NOT NULL,
  plan      TEXT    NOT NULL DEFAULT 'feld',   -- 'tw' = Torwart (blaues Trikot), 'feld' = Feldspieler
  pos_off   TEXT    NOT NULL DEFAULT '',       -- offensivere Position, z. B. 'RA'
  pos_def   TEXT    NOT NULL DEFAULT '',       -- defensivere Position, z. B. 'RV'
  pin_hash  TEXT    NOT NULL,             -- password_hash(), niemals die PIN im Klartext
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS progress (
  nr          INTEGER PRIMARY KEY REFERENCES players(nr),
  data        TEXT    NOT NULL,           -- JSON: {quiz:{}, tasks:{}}
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  name   TEXT PRIMARY KEY,                -- z. B. coach_pin_hash
  value  TEXT NOT NULL
);
