CREATE TABLE schedule_month_locks(month TEXT PRIMARY KEY,created INTEGER NOT NULL);
INSERT INTO schedule_month_locks SELECT month,COALESCE(generated_at,unixepoch()*1000) FROM schedules WHERE draft_json IS NOT NULL OR published_json IS NOT NULL;
CREATE TRIGGER lock_on_schedule_insert AFTER INSERT ON schedules WHEN NEW.draft_json IS NOT NULL BEGIN
 INSERT INTO schedule_month_locks SELECT NEW.month,unixepoch()*1000 WHERE NOT EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=NEW.month);
END;
CREATE TRIGGER lock_on_schedule_update AFTER UPDATE ON schedules WHEN NEW.draft_json IS NOT NULL BEGIN
 INSERT INTO schedule_month_locks SELECT NEW.month,unixepoch()*1000 WHERE NOT EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=NEW.month);
END;
CREATE TRIGGER availability_lock_insert BEFORE INSERT ON availability WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=COALESCE(NULLIF(NEW.month,''),substr(NEW.day,1,7))) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TRIGGER availability_lock_update BEFORE UPDATE ON availability WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=COALESCE(NULLIF(OLD.month,''),substr(OLD.day,1,7)) OR month=COALESCE(NULLIF(NEW.month,''),substr(NEW.day,1,7))) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TRIGGER availability_lock_delete BEFORE DELETE ON availability WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=COALESCE(NULLIF(OLD.month,''),substr(OLD.day,1,7))) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TRIGGER requests_lock_insert BEFORE INSERT ON requests WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=substr(NEW.day,1,7)) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TRIGGER requests_lock_update BEFORE UPDATE ON requests WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=substr(OLD.day,1,7) OR month=substr(NEW.day,1,7)) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TRIGGER requests_lock_delete BEFORE DELETE ON requests WHEN EXISTS(SELECT 1 FROM schedule_month_locks WHERE month=substr(OLD.day,1,7)) BEGIN SELECT RAISE(ABORT,'SCHEDULE_MONTH_LOCKED'); END;
CREATE TABLE exchange_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,member TEXT NOT NULL REFERENCES users(name),day TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL);
