-- Settings -> AI -> Prompts: the four prompts the AI is given (Campaign Initial Email, Campaign Follow-up Email, Company Initial
-- Email, Company Follow-up Email). The Examples tab is removed; its tables stay in place, unused. Like the other AI tables this
-- one is read and written only by the CRM server.

CREATE TABLE ai_prompts (
    key        VARCHAR(40) PRIMARY KEY CHECK (key IN ('campaign_initial_email', 'campaign_followup_email', 'company_initial_email', 'company_followup_email')),
    body       TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE ai_versions DROP CONSTRAINT ai_versions_kind_check;
ALTER TABLE ai_versions ADD CONSTRAINT ai_versions_kind_check CHECK (kind IN ('knowledge', 'rules', 'example', 'prompt'));

REVOKE ALL ON ai_prompts FROM PUBLIC, anon, authenticated;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
