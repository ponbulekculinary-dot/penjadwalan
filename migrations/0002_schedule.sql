CREATE TABLE schedules (
  month TEXT PRIMARY KEY,
  draft_json TEXT,
  published_json TEXT,
  generated_at INTEGER,
  published_at INTEGER
);
