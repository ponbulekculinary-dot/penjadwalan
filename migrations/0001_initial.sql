CREATE TABLE users (
  name TEXT PRIMARY KEY,
  password_hash TEXT
);
CREATE TABLE availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member TEXT NOT NULL REFERENCES users(name),
  kind TEXT NOT NULL,
  day TEXT,
  month TEXT,
  location TEXT,
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member TEXT NOT NULL REFERENCES users(name),
  day TEXT NOT NULL,
  location TEXT NOT NULL,
  service TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE TABLE cash (
  month TEXT NOT NULL,
  member TEXT NOT NULL REFERENCES users(name),
  status TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(name),
  PRIMARY KEY(month,member)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member TEXT NOT NULL REFERENCES users(name),
  expires INTEGER NOT NULL
);
INSERT INTO users(name) VALUES
  ('EMEN'),('DEDY'),('AYU'),('BOWO'),('ANDRE'),('BILLY'),('OWEN'),
  ('MELVERN'),('DAUD'),('EVAN'),('TIMI'),('EVELYN'),('AGUS'),('DEMAS');
