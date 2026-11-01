ALTER TABLE schedules ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE schedules ADD COLUMN approval_note TEXT;
ALTER TABLE schedules ADD COLUMN approved_by TEXT;
