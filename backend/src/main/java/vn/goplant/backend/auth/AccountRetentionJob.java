package vn.goplant.backend.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Periodically purges expired verification/reset tokens and abandoned unverified accounts. */
@Component
public class AccountRetentionJob {
    private static final Logger log = LoggerFactory.getLogger(AccountRetentionJob.class);
    private final AccountRetentionService retention;

    public AccountRetentionJob(AccountRetentionService retention) {
        this.retention = retention;
    }

    @Scheduled(initialDelayString = "${goplant.auth.token-cleanup-initial-delay:PT7M}",
            fixedDelayString = "${goplant.auth.token-cleanup-interval:P1D}")
    public void run() {
        int purgedTokens = retention.purgeExpiredActionTokens();
        int purgedPendingUsers = retention.purgeAbandonedPendingUsers();
        if (purgedTokens > 0 || purgedPendingUsers > 0) {
            log.info("Account retention cleanup: purged {} expired action token(s), {} abandoned pending user(s)",
                    purgedTokens, purgedPendingUsers);
        }
    }
}
