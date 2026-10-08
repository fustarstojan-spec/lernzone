-- Lernzone – Datenbankschema (SQLite; für MySQL: INTEGER → INT, TEXT → VARCHAR/JSON)
CREATE TABLE IF NOT EXISTS players (
  nr        INTEGER PRIMARY KEY,          -- Trikotnummer = Spieler-ID
  pos       TEXT    NOT NULL,
  plan      TEXT    NOT NULL DEFAULT 'feld',
  pin_hash  TEXT    NOT NULL,             -- password_hash(), niemals die PIN im Klartext
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS progress (
  nr          INTEGER PRIMARY KEY REFERENCES players(nr),
  data        TEXT    NOT NULL,           -- JSON: {quiz:{}, tasks:{}}
  updated_at  TEXT    NOT NULL
);
