ALTER TABLE users ADD COLUMN schedule_active INTEGER NOT NULL DEFAULT 1 CHECK(schedule_active IN (0,1));
