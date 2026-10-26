-- Pipeline rules: one editable rule per key. For now just 'on_verified': when a human verification ends as
-- Ready for Outreach, move the company to this status / stage (never backwards). Admins change it in Settings.

CREATE TABLE pipeline_rules (
    rule_key    VARCHAR(40) PRIMARY KEY,
    status_id   BIGINT NOT NULL REFERENCES pipeline_statuses(id),
    stage_id    BIGINT NOT NULL,
    is_enabled  BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- the stage has to belong to the status
    FOREIGN KEY (stage_id, status_id) REFERENCES pipeline_stages (id, status_id)
);

INSERT INTO pipeline_rules (rule_key, status_id, stage_id)
SELECT 'on_verified', s.id, g.id
  FROM pipeline_statuses s
  JOIN pipeline_stages g ON g.status_id = s.id
 WHERE s.name = 'Qualified' AND g.name = 'Ready for Outreach';

GRANT SELECT ON pipeline_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_rules TO service_role;
