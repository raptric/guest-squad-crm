-- Generic, admin-editable dropdown values. Replaces hardcoded enums for fields whose
-- allowed values change over time (starting with lead_status and lifecycle_stage) so an
-- admin can add/remove options without a code change or migration.
CREATE TABLE picklist_values (
    id          BIGSERIAL PRIMARY KEY,
    field_name  VARCHAR(60) NOT NULL,
    value       VARCHAR(100) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (field_name, value)
);

CREATE INDEX idx_picklist_values_field_name ON picklist_values(field_name, sort_order);

-- companies.lead_status / lifecycle_stage move from a fixed DB CHECK to app-validated,
-- admin-configurable values (same tradeoff already made for source/signal_type/pain_type).
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_lead_status_check;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_lifecycle_stage_check;
ALTER TABLE companies ALTER COLUMN lifecycle_stage SET DEFAULT 'Lead';

INSERT INTO picklist_values (field_name, value, sort_order) VALUES
    ('lead_status', 'New', 1),
    ('lead_status', 'Needs Review', 2),
    ('lead_status', 'Qualified', 3),
    ('lead_status', 'DisQualified', 4),
    ('lifecycle_stage', 'Lead', 1),
    ('lifecycle_stage', 'Sales Qualified', 2),
    ('lifecycle_stage', 'Opportunity', 3),
    ('lifecycle_stage', 'Customer', 4)
ON CONFLICT (field_name, value) DO NOTHING;
