-- Expand account_action_tokens for password resets and add refresh_tokens for mobile session continuity.

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT c.conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'account_action_tokens'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%purpose%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE account_action_tokens DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE account_action_tokens
    ADD CONSTRAINT account_action_tokens_purpose_check
    CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'));

CREATE INDEX IF NOT EXISTS ix_account_action_tokens_user_purpose
    ON account_action_tokens(user_id, purpose, expires_at DESC);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by_token_id uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens(user_id, revoked_at, expires_at DESC);
