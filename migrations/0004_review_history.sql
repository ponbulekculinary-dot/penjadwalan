ALTER TABLE schedules ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedules ADD COLUMN updated_by TEXT;
ALTER TABLE schedules ADD COLUMN action TEXT;
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO app_meta VALUES ('availability_revision',0);
CREATE TRIGGER availability_insert AFTER INSERT ON availability BEGIN
 UPDATE app_meta SET value=value+1 WHERE key='availability_revision'; END;
CREATE TRIGGER availability_update AFTER UPDATE ON availability BEGIN
 UPDATE app_meta SET value=value+1 WHERE key='availability_revision'; END;
CREATE TRIGGER availability_delete AFTER DELETE ON availability BEGIN
 UPDATE app_meta SET value=value+1 WHERE key='availability_revision'; END;
CREATE TABLE schedule_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 month TEXT NOT NULL,
 revision INTEGER NOT NULL,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 created INTEGER NOT NULL,
 before_json TEXT,
 after_json TEXT NOT NULL,
 UNIQUE(month,revision)
);
CREATE TRIGGER schedule_insert_history AFTER INSERT ON schedules BEGIN
 INSERT INTO schedule_history(month,revision,actor,action,created,after_json)
 VALUES(NEW.month,NEW.revision,COALESCE(NEW.updated_by,'SYSTEM'),COALESCE(NEW.action,'generate'),unixepoch()*1000,
 json_object('status',NEW.status,'draft',json(NEW.draft_json),'published',json(NEW.published_json)));
END;
CREATE TRIGGER schedule_update_history AFTER UPDATE ON schedules BEGIN
 INSERT INTO schedule_history(month,revision,actor,action,created,before_json,after_json)
 VALUES(NEW.month,NEW.revision,COALESCE(NEW.updated_by,'SYSTEM'),COALESCE(NEW.action,'update'),unixepoch()*1000,
 json_object('status',OLD.status,'draft',json(OLD.draft_json),'published',json(OLD.published_json)),
 json_object('status',NEW.status,'draft',json(NEW.draft_json),'published',json(NEW.published_json)));
END;
CREATE INDEX schedule_history_month ON schedule_history(month,revision);
