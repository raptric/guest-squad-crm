-- Who can be enrolled in a campaign, controlled from Settings -> Rules. Two parts:
--   * require_verified: the company's verification flag must be Verified (default on)
--   * allowed combinations of pipeline status + stage (NULL stage = any stage of that status). No rows = any stage.
-- The defaults reproduce the earlier behaviour (verified is required, any stage), so nothing changes until an admin edits it.
-- Only the company's owner can enroll, and that is not a setting.

CREATE TABLE campaign_enrollment_rule (
    id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    require_verified BOOLEAN NOT NULL DEFAULT true,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO campaign_enrollment_rule (id) VALUES (1);

CREATE TABLE campaign_enrollment_allowed (
    id         BIGSERIAL PRIMARY KEY,
    status_id  BIGINT NOT NULL REFERENCES pipeline_statuses(id),
    stage_id   BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- a stage has to belong to its status (not checked when stage_id is NULL = "any stage")
    FOREIGN KEY (stage_id, status_id) REFERENCES pipeline_stages (id, status_id)
);
CREATE UNIQUE INDEX ux_campaign_enrollment_allowed ON campaign_enrollment_allowed (status_id, coalesce(stage_id, 0));

GRANT SELECT ON campaign_enrollment_rule, campaign_enrollment_allowed TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_enrollment_rule, campaign_enrollment_allowed TO service_role;
GRANT USAGE, SELECT ON SEQUENCE campaign_enrollment_allowed_id_seq TO service_role;
