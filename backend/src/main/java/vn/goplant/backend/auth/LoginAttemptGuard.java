package vn.goplant.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * In-memory rate limiter / temporary lockout for consecutive failed login attempts per email.
 */
@Component
public class LoginAttemptGuard {
    private final Clock clock;
    private final int maxAttempts;
    private final Duration lockDuration;
    private final ConcurrentHashMap<String, AttemptState> attempts = new ConcurrentHashMap<>();

    public LoginAttemptGuard(Clock clock,
                             @Value("${goplant.auth.login-max-attempts:5}") int maxAttempts,
                             @Value("${goplant.auth.login-lock-minutes:5}") int lockMinutes) {
        this.clock = clock;
        this.maxAttempts = Math.max(1, maxAttempts);
        this.lockDuration = Duration.ofMinutes(Math.max(1, lockMinutes));
    }

    public void checkAllowed(String normalizedEmail) {
        AttemptState state = attempts.get(normalizedEmail);
        if (state == null || state.lockedUntil() == null) return;
        Instant now = clock.instant();
        if (now.isBefore(state.lockedUntil())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã nhập sai mật khẩu quá " + maxAttempts + " lần. Vui lòng thử lại sau "
                            + lockDuration.toMinutes() + " phút.");
        }
        attempts.remove(normalizedEmail, state);
    }

    public void recordFailure(String normalizedEmail) {
        Instant now = clock.instant();
        attempts.compute(normalizedEmail, (key, current) -> {
            if (current == null || (current.lockedUntil() != null && !now.isBefore(current.lockedUntil()))) {
                int count = 1;
                return count >= maxAttempts
                        ? new AttemptState(count, now.plus(lockDuration))
                        : new AttemptState(count, null);
            }
            if (current.lockedUntil() != null) {
                return current;
            }
            int next = current.failures() + 1;
            return next >= maxAttempts
                    ? new AttemptState(next, now.plus(lockDuration))
                    : new AttemptState(next, null);
        });
    }

    public void reset(String normalizedEmail) {
        attempts.remove(normalizedEmail);
    }

    private record AttemptState(int failures, Instant lockedUntil) {}
}
