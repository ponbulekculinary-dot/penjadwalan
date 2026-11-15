-- Existing primary key (month,member) and user foreign keys are preserved.
ALTER TABLE cash ADD COLUMN updated_at INTEGER;
