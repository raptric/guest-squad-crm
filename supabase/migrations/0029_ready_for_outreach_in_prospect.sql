-- "Ready for Outreach" lives in one place: the Prospect status. Prospect / Outreach Active is renamed to
-- Prospect / Ready for Outreach; the old Qualified / Ready for Outreach stage is retired (companies on it move over,
-- the "when verified" rule points at the new stage). The verification field itself only says Verified from now on.

UPDATE pipeline_stages g
   SET name = 'Ready for Outreach'
  FROM pipeline_statuses s
 WHERE g.status_id = s.id AND s.name = 'Prospect' AND g.name = 'Outreach Active';

WITH target AS (
    SELECT s.id AS status_id, g.id AS stage_id
      FROM pipeline_statuses s JOIN pipeline_stages g ON g.status_id = s.id
     WHERE s.name = 'Prospect' AND g.name = 'Ready for Outreach'
), old AS (
    SELECT g.id AS stage_id
      FROM pipeline_statuses s JOIN pipeline_stages g ON g.status_id = s.id
     WHERE s.name = 'Qualified' AND g.name = 'Ready for Outreach'
), moved AS (
    UPDATE companies c
       SET pipeline_status_id = t.status_id, pipeline_stage_id = t.stage_id
      FROM target t, old o
     WHERE c.pipeline_stage_id = o.stage_id
    RETURNING c.id
)
INSERT INTO company_pipeline_history (company_id, from_status, from_stage, to_status, to_stage, changed_by_name)
SELECT id, 'Qualified', 'Ready for Outreach', 'Prospect', 'Ready for Outreach', 'System (pipeline update)' FROM moved;

UPDATE pipeline_rules r
   SET status_id = t.status_id, stage_id = t.stage_id, updated_at = now()
  FROM (SELECT s.id AS status_id, g.id AS stage_id
          FROM pipeline_statuses s JOIN pipeline_stages g ON g.status_id = s.id
         WHERE s.name = 'Prospect' AND g.name = 'Ready for Outreach') t
 WHERE r.rule_key = 'on_verified';

UPDATE pipeline_stages g
   SET is_active = false
  FROM pipeline_statuses s
 WHERE g.status_id = s.id AND s.name = 'Qualified' AND g.name = 'Ready for Outreach';
