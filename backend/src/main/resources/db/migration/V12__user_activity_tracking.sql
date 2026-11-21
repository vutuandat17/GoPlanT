ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_users_last_active
    ON users(last_active_at DESC NULLS LAST);
