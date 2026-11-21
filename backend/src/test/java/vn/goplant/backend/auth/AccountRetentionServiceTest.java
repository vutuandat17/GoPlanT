package vn.goplant.backend.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AccountRetentionServiceTest {

    @Test
    void purgesExpiredActionTokensAndAbandonedPendingUsers() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(contains("DELETE FROM account_action_tokens"), any(Timestamp.class), any(Timestamp.class)))
                .thenReturn(5);
        when(jdbc.update(contains("DELETE FROM users u"), any(Timestamp.class), any(Timestamp.class)))
                .thenReturn(2);

        AccountRetentionService service = new AccountRetentionService(jdbc, 7, 30);
        assertEquals(5, service.purgeExpiredActionTokens());
        assertEquals(2, service.purgeAbandonedPendingUsers());
    }

    @Test
    void skipsPendingUserCleanupWhenDisabled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AccountRetentionService service = new AccountRetentionService(jdbc, 7, 0);
        assertEquals(0, service.purgeAbandonedPendingUsers());
        verifyNoInteractions(jdbc);
    }
}
