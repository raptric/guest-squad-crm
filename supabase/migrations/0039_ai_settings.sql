-- Settings -> AI: which AI service the CRM uses, the (encrypted) API keys, and a log of every AI call.
-- These tables are read and written only by the CRM server over its direct database connection. Nothing is
-- granted to the public API roles and row level security is on with no policies, so they are not reachable
-- through the Supabase REST API at all.

-- One row per provider ('anthropic' = Claude, 'openai' = ChatGPT). The key is stored encrypted (AES-256-GCM,
-- secret in the AI_KEY_SECRET env var); key_last4 is only for showing "…ab12" in the screen.
CREATE TABLE ai_providers (
    provider    VARCHAR(20) PRIMARY KEY CHECK (provider IN ('anthropic', 'openai')),
    api_key_enc TEXT,
    key_last4   VARCHAR(4),
    model       VARCHAR(100) NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO ai_providers (provider, model) VALUES ('anthropic', 'claude-sonnet-5-5'), ('openai', '');

-- Single row: the provider in use and the per-person daily limit on generations.
CREATE TABLE ai_settings (
    id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    active_provider VARCHAR(20) CHECK (active_provider IN ('anthropic', 'openai')),
    daily_limit     INTEGER NOT NULL DEFAULT 30 CHECK (daily_limit BETWEEN 1 AND 1000),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ai_settings (id) VALUES (1);

-- Every call to an AI service: who, which provider/model, what for, how many tokens, and whether it worked.
CREATE TABLE ai_usage (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    provider      VARCHAR(20) NOT NULL,
    model         VARCHAR(100) NOT NULL,
    purpose       VARCHAR(40) NOT NULL,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    ok            BOOLEAN NOT NULL,
    error         VARCHAR(300),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_usage_user_day ON ai_usage (user_id, created_at DESC);

REVOKE ALL ON ai_providers, ai_settings, ai_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE ai_usage_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage     ENABLE ROW LEVEL SECURITY;
