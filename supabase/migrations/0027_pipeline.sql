-- Pipeline: a top-level STATUS (New, Qualified, Prospect, Deal, Customer, Nurture, Disqualified) and a STAGE inside it.
-- Stages belong to one status, so the stage list on a company depends on its status. Admins add / rename / reorder /
-- switch off both from Settings. Everything is moved by hand for now: no automatic rules.
-- The old lead_status / lifecycle_stage columns are left alone (the research agent and scraper still write them
-- until the MCP is updated); the pipeline lives in its own columns.

CREATE TABLE pipeline_statuses (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    color       VARCHAR(20) NOT NULL DEFAULT 'zinc',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_pipeline_statuses_name ON pipeline_statuses (lower(name));

CREATE TABLE pipeline_stages (
    id          BIGSERIAL PRIMARY KEY,
    status_id   BIGINT NOT NULL REFERENCES pipeline_statuses(id) ON DELETE RESTRICT,
    name        VARCHAR(60) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, status_id)
);
CREATE UNIQUE INDEX ux_pipeline_stages_name ON pipeline_stages (status_id, lower(name));

ALTER TABLE companies
    ADD COLUMN pipeline_status_id BIGINT REFERENCES pipeline_statuses(id) ON DELETE RESTRICT,
    ADD COLUMN pipeline_stage_id  BIGINT REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
    -- a stage can only be used together with the status it belongs to
    ADD CONSTRAINT fk_companies_stage_matches_status
        FOREIGN KEY (pipeline_stage_id, pipeline_status_id) REFERENCES pipeline_stages (id, status_id);
CREATE INDEX idx_companies_pipeline_status ON companies (pipeline_status_id);
CREATE INDEX idx_companies_pipeline_stage ON companies (pipeline_stage_id);

-- every change, who made it, from and to (names are copied so history stays readable if a name is edited later)
CREATE TABLE company_pipeline_history (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    from_status       VARCHAR(60),
    from_stage        VARCHAR(60),
    to_status         VARCHAR(60) NOT NULL,
    to_stage          VARCHAR(60) NOT NULL,
    changed_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    changed_by_name   VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_pipeline_history_company ON company_pipeline_history (company_id, created_at DESC);

-- ---- starting lists (editable in Settings) ----
INSERT INTO pipeline_statuses (name, color, sort_order) VALUES
    ('New',          'sky',     10),
    ('Qualified',    'emerald', 20),
    ('Prospect',     'violet',  30),
    ('Deal',         'amber',   40),
    ('Customer',     'teal',    50),
    ('Nurture',      'orange',  60),
    ('Disqualified', 'zinc',    70);

INSERT INTO pipeline_stages (status_id, name, sort_order)
SELECT s.id, v.stage, v.ord
  FROM (VALUES
    ('New', 'Not researched', 10), ('New', 'Researching', 20), ('New', 'Needs Review', 30),
    ('Qualified', 'Awaiting verification', 10), ('Qualified', 'Ready for Outreach', 20),
    ('Prospect', 'Outreach Active', 10), ('Prospect', 'Engaged', 20), ('Prospect', 'Meeting Booked', 30),
    ('Deal', 'Proposal Sent', 10), ('Deal', 'Negotiation', 20),
    ('Customer', 'Onboarding', 10), ('Customer', 'Active', 20),
    ('Nurture', 'No response', 10), ('Nurture', 'Not now', 20),
    ('Disqualified', 'Not a fit', 10), ('Disqualified', 'Duplicate', 20), ('Disqualified', 'Closed', 30)
  ) AS v(status, stage, ord)
  JOIN pipeline_statuses s ON s.name = v.status;

-- ---- move existing companies over from the old two fields ----
WITH target AS (
    SELECT c.id,
           CASE
             WHEN c.lifecycle_stage = 'Customer'                                   THEN 'Customer|Active'
             WHEN c.lifecycle_stage = 'Opportunity'                                THEN 'Deal|Proposal Sent'
             WHEN c.lead_status = 'DisQualified'                                   THEN 'Disqualified|Not a fit'
             WHEN c.lead_status IN ('Nurturing', 'Nurture')                        THEN 'Nurture|Not now'
             WHEN c.verification_status = 'Ready for Outreach'                     THEN 'Qualified|Ready for Outreach'
             WHEN c.lead_status = 'Qualified' OR c.lifecycle_stage = 'Sales Qualified' THEN 'Qualified|Awaiting verification'
             WHEN c.lead_status = 'Needs Review'                                   THEN 'New|Needs Review'
             ELSE 'New|Not researched'
           END AS pair
      FROM companies c
)
UPDATE companies c
   SET pipeline_status_id = s.id, pipeline_stage_id = g.id
  FROM target t
  JOIN pipeline_statuses s ON s.name = split_part(t.pair, '|', 1)
  JOIN pipeline_stages g ON g.status_id = s.id AND g.name = split_part(t.pair, '|', 2)
 WHERE c.id = t.id;

-- Any company created without a status (manual add, scraper import, the research agent's MCP tools) starts at the
-- first active status / first active stage, so no write path has to know about the pipeline yet.
CREATE FUNCTION companies_default_pipeline() RETURNS trigger AS $$
BEGIN
    IF NEW.pipeline_status_id IS NULL THEN
        SELECT id INTO NEW.pipeline_status_id FROM pipeline_statuses WHERE is_active ORDER BY sort_order, id LIMIT 1;
    END IF;
    IF NEW.pipeline_stage_id IS NULL AND NEW.pipeline_status_id IS NOT NULL THEN
        SELECT id INTO NEW.pipeline_stage_id FROM pipeline_stages
         WHERE status_id = NEW.pipeline_status_id AND is_active ORDER BY sort_order, id LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_default_pipeline BEFORE INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_default_pipeline();

GRANT SELECT ON pipeline_statuses, pipeline_stages, company_pipeline_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_statuses, pipeline_stages, company_pipeline_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pipeline_statuses_id_seq, pipeline_stages_id_seq, company_pipeline_history_id_seq TO service_role;
