-- Ties the app's `users` table to Supabase Auth (auth.users) so Supabase handles
-- login/password reset/invite emails. The original `password` column is kept as-is
-- (per decision: don't remove it) but is no longer written to by the app -- Supabase Auth
-- owns the real credential, so making it nullable avoids forcing a fake value on insert.
ALTER TABLE users
    ALTER COLUMN password DROP NOT NULL,
    ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('super_admin', 'user'));

CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);
