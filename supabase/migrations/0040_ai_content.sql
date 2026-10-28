-- Settings -> AI: what the AI is told. Company knowledge, the writing rules, and example copy, plus a version history of
-- every change so any of them can be rolled back. Like the AI provider tables these are read and written only by the CRM
-- server; nothing is granted to the public API roles.

-- One row per topic. key is a fixed topic ('about', 'proof', ...) or 'service:<name>' for each service in the Offer Service list.
CREATE TABLE ai_knowledge (
    key        VARCHAR(100) PRIMARY KEY,
    body       TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- Single row: the cold email rules, step roles, voice, banned words, pain-to-angle map and generation defaults (JSON,
-- validated by the app before it is saved).
CREATE TABLE ai_rules (
    id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- Real emails, call scripts and LinkedIn messages, good ones to copy the style of and bad ones to avoid.
-- role says what kind of step it is (and so the channel). audience is a Company Type from Settings -> Lists, or 'any'.
-- Deleting only switches is_active off, so the history can bring it back.
CREATE TABLE ai_examples (
    id         BIGSERIAL PRIMARY KEY,
    role       VARCHAR(30) NOT NULL CHECK (role IN ('opener', 'followup', 'value_add', 'breakup', 'linkedin_connect', 'linkedin_message', 'call_script')),
    audience   VARCHAR(60) NOT NULL DEFAULT 'any',
    subject    VARCHAR(200) NOT NULL DEFAULT '',
    body       TEXT NOT NULL,
    kind       VARCHAR(4) NOT NULL DEFAULT 'good' CHECK (kind IN ('good', 'bad')),
    note       VARCHAR(500) NOT NULL DEFAULT '',
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- Every save writes the full new state here. The newest row for a (kind, ref) is the current one; restoring an older row
-- applies it and adds a new row on top.
CREATE TABLE ai_versions (
    id         BIGSERIAL PRIMARY KEY,
    kind       VARCHAR(12) NOT NULL CHECK (kind IN ('knowledge', 'rules', 'example')),
    ref        VARCHAR(100) NOT NULL,
    snapshot   JSONB NOT NULL,
    changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_versions_ref ON ai_versions (kind, ref, id DESC);

REVOKE ALL ON ai_knowledge, ai_rules, ai_examples, ai_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE ai_examples_id_seq, ai_versions_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_examples  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_versions  ENABLE ROW LEVEL SECURITY;
