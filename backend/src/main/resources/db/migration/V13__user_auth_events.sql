ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS session_family_id uuid;

CREATE TABLE user_auth_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_family_id uuid,
    event_type varchar(32) NOT NULL CHECK (event_type IN (
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGOUT',
        'ADMIN_REVOKED',
        'PASSWORD_CHANGED'
    )),
    platform varchar(32),
    device_label varchar(160),
    ip_address varchar(64),
    detail text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_user_auth_events_user_created
    ON user_auth_events(user_id, created_at DESC);

CREATE INDEX ix_user_auth_events_created
    ON user_auth_events(created_at DESC);
