package vn.goplant.backend.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cleans up expired/consumed account action tokens and long-abandoned unverified accounts
 * so mistyped emails are eventually freed and token tables stay compact.
 */
@Service
public class AccountRetentionService {
    private final JdbcTemplate jdbc;
    private final int actionTokenRetentionDays;
    private final int pendingUserRetentionDays;

    public AccountRetentionService(
            JdbcTemplate jdbc,
            @Value("${goplant.auth.action-token-retention-days:7}") int actionTokenRetentionDays,
            @Value("${goplant.auth.pending-user-retention-days:30}") int pendingUserRetentionDays) {
        this.jdbc = jdbc;
        this.actionTokenRetentionDays = Math.max(1, actionTokenRetentionDays);
        this.pendingUserRetentionDays = pendingUserRetentionDays;
    }

    @Transactional
    public int purgeExpiredActionTokens() {
        Timestamp cutoff = Timestamp.from(Instant.now().minus(actionTokenRetentionDays, ChronoUnit.DAYS));
        return jdbc.update("""
                DELETE FROM account_action_tokens
                WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
                   OR expires_at < ?
                """, cutoff, cutoff);
    }

    @Transactional
    public int purgeAbandonedPendingUsers() {
        if (pendingUserRetentionDays <= 0) {
            return 0;
        }
        Timestamp cutoff = Timestamp.from(Instant.now().minus(pendingUserRetentionDays, ChronoUnit.DAYS));
        return jdbc.update("""
                DELETE FROM users u
                WHERE u.status = 'pending_verification'
                  AND u.created_at < ?
                  AND u.last_login_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM user_roles ur
                      JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id
                        AND r.code IN ('admin', 'moderator')
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM account_action_tokens t
                      WHERE t.user_id = u.id
                        AND t.created_at >= ?
                  )
                """, cutoff, cutoff);
    }
}
