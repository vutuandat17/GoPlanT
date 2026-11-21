ALTER TABLE user_roles
    ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action varchar(40) NOT NULL CHECK (action IN (
        'LOCK_USER',
        'UNLOCK_USER',
        'DISABLE_USER',
        'ACTIVATE_USER',
        'GRANT_ADMIN',
        'REVOKE_ADMIN',
        'REVOKE_SESSIONS'
    )),
    previous_value varchar(120),
    new_value varchar(120),
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_admin_audit_logs_target ON admin_audit_logs(target_user_id, created_at DESC);
CREATE INDEX ix_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
