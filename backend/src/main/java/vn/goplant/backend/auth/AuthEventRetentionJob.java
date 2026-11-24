package vn.goplant.backend.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Purges expired authentication history rows according to the configured retention window. */
@Component
public class AuthEventRetentionJob {
    private static final Logger log = LoggerFactory.getLogger(AuthEventRetentionJob.class);
    private final AuthEventService authEvents;

    public AuthEventRetentionJob(AuthEventService authEvents) {
        this.authEvents = authEvents;
    }

    @Scheduled(initialDelayString = "${goplant.auth.event-cleanup-initial-delay:PT5M}",
            fixedDelayString = "${goplant.auth.event-cleanup-interval:P1D}")
    public void run() {
        int purged = authEvents.purgeExpiredEvents();
        if (purged > 0) {
            log.info("Auth event retention cleanup: purged {} expired auth event(s)", purged);
        }
    }
}
