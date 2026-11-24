ALTER TABLE admin_audit_logs
    DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_action_check CHECK (action IN (
        'LOCK_USER',
        'UNLOCK_USER',
        'DISABLE_USER',
        'ACTIVATE_USER',
        'GRANT_ADMIN',
        'REVOKE_ADMIN',
        'GRANT_MODERATOR',
        'REVOKE_MODERATOR',
        'REVOKE_SESSIONS',
        'RESEND_VERIFICATION',
        'SEND_PASSWORD_RESET'
    ));
