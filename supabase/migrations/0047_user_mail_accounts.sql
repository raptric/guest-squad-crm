-- The Gmail (or Google Workspace) address and app password each person adds on their Profile, so campaign emails can be sent from
-- their own inbox. The password is stored encrypted (AES-256-GCM, a key derived from the AI_KEY_SECRET env var) and is only ever
-- read by the CRM server when it sends. Like the AI tables, this one is closed to the public API roles and has row level security on.
CREATE TABLE user_mail_accounts (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gmail_address VARCHAR(255) NOT NULL,
    password_enc  TEXT NOT NULL,
    verified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON user_mail_accounts FROM PUBLIC, anon, authenticated;
ALTER TABLE user_mail_accounts ENABLE ROW LEVEL SECURITY;
