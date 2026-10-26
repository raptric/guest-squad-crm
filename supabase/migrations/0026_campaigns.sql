-- Campaigns (phase 1, fully manual): admins define a campaign and its steps; the owner of a Ready for Outreach
-- company enrolls it; each step becomes a task for the company's owner, who ticks it off by hand.
-- Tasks keep their own copy of the step (day, channel, title, instructions), so editing a campaign later only
-- affects future enrollments. Who a task belongs to is always the company's CURRENT owner (no copy to go stale).

CREATE TABLE campaigns (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    status       VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_campaigns_name ON campaigns (lower(name));

-- channel is only a label: nothing is sent or integrated, the person does the step themselves.
CREATE TABLE campaign_steps (
    id            BIGSERIAL PRIMARY KEY,
    campaign_id   BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    day_number    INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 365),
    channel       VARCHAR(30) NOT NULL
        CHECK (channel IN ('Email', 'Call', 'LinkedIn connection', 'LinkedIn message', 'WhatsApp / SMS', 'Other')),
    title         VARCHAR(200) NOT NULL,
    instructions  TEXT NOT NULL DEFAULT '',
    UNIQUE (campaign_id, position)
);

CREATE TABLE campaign_enrollments (
    id               BIGSERIAL PRIMARY KEY,
    campaign_id      BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recipient_type   VARCHAR(10) NOT NULL CHECK (recipient_type IN ('contact', 'company')),
    contact_id       BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
    recipient_label  VARCHAR(255) NOT NULL,
    start_date       DATE NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
    stop_note        TEXT,
    stopped_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    stopped_at       TIMESTAMPTZ,
    enrolled_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);
CREATE INDEX idx_campaign_enrollments_company ON campaign_enrollments (company_id, status);
CREATE INDEX idx_campaign_enrollments_campaign ON campaign_enrollments (campaign_id, status);
-- the same recipient can't be in the same campaign twice at once
CREATE UNIQUE INDEX ux_campaign_enrollments_active_recipient
    ON campaign_enrollments (campaign_id, company_id, coalesce(contact_id, 0)) WHERE status = 'active';

CREATE TABLE campaign_tasks (
    id                    BIGSERIAL PRIMARY KEY,
    enrollment_id         BIGINT NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
    step_position         INTEGER NOT NULL,
    step_day              INTEGER NOT NULL,
    step_channel          VARCHAR(30) NOT NULL,
    step_title            VARCHAR(200) NOT NULL,
    step_instructions     TEXT NOT NULL DEFAULT '',
    due_date              DATE NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped', 'cancelled')),
    completed_at          TIMESTAMPTZ,
    completed_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    notes                 TEXT,
    -- reserved for the later automatic checks (reply / sent-mail verification); unused in phase 1
    verification_status   VARCHAR(20),
    verified_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_tasks_enrollment ON campaign_tasks (enrollment_id, step_position);
CREATE INDEX idx_campaign_tasks_due ON campaign_tasks (due_date) WHERE status = 'pending';

GRANT SELECT ON campaigns, campaign_steps, campaign_enrollments, campaign_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns, campaign_steps, campaign_enrollments, campaign_tasks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE campaigns_id_seq, campaign_steps_id_seq, campaign_enrollments_id_seq, campaign_tasks_id_seq TO service_role;
