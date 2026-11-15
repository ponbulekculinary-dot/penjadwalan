ALTER TABLE availability ADD COLUMN services_json TEXT NOT NULL DEFAULT '[]';
-- Preserve the effective restrictions of legacy morning rules, including overlapping rows.
INSERT INTO availability(member,kind,day,month,location,note,created,services_json)
SELECT legacy.member,'month_services','',legacy.month,'',COALESCE(group_concat(legacy.note,'; '),''),min(legacy.created),
 (SELECT json_group_array(json_object('location',catalog.location,'service',catalog.service))
  FROM (SELECT 'MOI' AS location,'IR 1' AS service UNION ALL SELECT 'MOI','IR 2'
        UNION ALL SELECT 'Tamsir','IR 1' UNION ALL SELECT 'Tamsir','IR 2') AS catalog
  WHERE NOT EXISTS (SELECT 1 FROM availability AS old WHERE old.member=legacy.member AND old.month=legacy.month
    AND old.kind='month_morning' AND old.location<>'Kedua lokasi' AND old.location<>catalog.location))
FROM availability AS legacy WHERE legacy.kind='month_morning' GROUP BY legacy.member,legacy.month;
DELETE FROM availability WHERE kind='month_morning';
CREATE UNIQUE INDEX availability_services_month ON availability(member,month) WHERE kind='month_services';
