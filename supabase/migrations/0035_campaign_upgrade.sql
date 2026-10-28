-- Campaign upgrade, step 1: identity (code, owner, visibility, four statuses, duplicate source), messaging
-- (angle, pain points, positioning, differentiators, objection pairs) and the two Settings lists behind it.

-- Statuses: draft / active / paused / completed (the old 'archived' becomes completed).
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
UPDATE campaigns SET status = 'completed' WHERE status = 'archived';
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'active', 'paused', 'completed'));
ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'draft';

CREATE SEQUENCE campaign_code_seq;
ALTER TABLE campaigns
    ADD COLUMN code            VARCHAR(20),
    ADD COLUMN owner_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    -- private = owner (and admins); team = the team in team_id; public = every signed-in user
    ADD COLUMN visibility      VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'public')),
    ADD COLUMN team_id         BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    ADD COLUMN copied_from     BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
    ADD COLUMN paused_at       TIMESTAMPTZ,
    ADD COLUMN outreach_angle  VARCHAR(100),
    ADD COLUMN pain_point      TEXT NOT NULL DEFAULT '',
    ADD COLUMN secondary_pains TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN positioning     TEXT NOT NULL DEFAULT '',
    ADD COLUMN differentiators TEXT[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT campaigns_team_visibility CHECK (visibility <> 'team' OR team_id IS NOT NULL);

UPDATE campaigns SET code = 'C-' || lpad(nextval('campaign_code_seq')::text, 3, '0'), owner_id = created_by WHERE code IS NULL;
ALTER TABLE campaigns ALTER COLUMN code SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN code SET DEFAULT ('C-' || lpad(nextval('campaign_code_seq')::text, 3, '0'));
CREATE UNIQUE INDEX ux_campaigns_code ON campaigns (code);
-- the code is the unique ID now; names may repeat
DROP INDEX IF EXISTS ux_campaigns_name;

CREATE TABLE campaign_objections (
    id           BIGSERIAL PRIMARY KEY,
    campaign_id  BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    objection    VARCHAR(200) NOT NULL,
    response     VARCHAR(600) NOT NULL DEFAULT '',
    UNIQUE (campaign_id, position)
);
GRANT SELECT ON campaign_objections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_objections TO service_role;
GRANT USAGE, SELECT ON SEQUENCE campaign_objections_id_seq, campaign_code_seq TO service_role;

-- Admin-editable lists (Settings).
INSERT INTO picklist_values (field_name, value, sort_order) VALUES
    ('outreach_angle', 'After-hours guest coverage', 1),
    ('outreach_angle', 'Missed calls and slow response', 2),
    ('outreach_angle', 'Late arrival and check-in support', 3),
    ('outreach_angle', 'Contactless / self check-in support', 4),
    ('outreach_angle', 'Staffing gaps', 5),
    ('outreach_angle', 'Other', 6),
    ('key_differentiator', 'Property-trained agents', 1),
    ('key_differentiator', 'PMS integration', 2),
    ('key_differentiator', 'Flexible coverage', 3)
ON CONFLICT (field_name, value) DO NOTHING;
