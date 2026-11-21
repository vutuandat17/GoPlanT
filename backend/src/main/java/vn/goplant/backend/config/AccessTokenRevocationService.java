package vn.goplant.backend.config;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

/**
 * In-memory short-lived revocation registry so locking/disabling a user,
 * revoking their sessions, or revoking admin privileges takes effect immediately (0s)
 * without waiting for the 15-minute access token TTL to expire.
 */
@Service
public class AccessTokenRevocationService {
    private static final long RETENTION_SECONDS = 20 * 60L;

    private final Set<UUID> blockedUsers = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<UUID, Instant> revokedAtOrBefore = new ConcurrentHashMap<>();

    public void blockUser(UUID userId) {
        if (userId == null) {
            return;
        }
        blockedUsers.add(userId);
        revokeTokensAtOrBefore(userId, Instant.now());
    }

    public void unblockUser(UUID userId) {
        if (userId == null) {
            return;
        }
        blockedUsers.remove(userId);
    }

    public void revokeTokensAtOrBefore(UUID userId, Instant cutoff) {
        if (userId == null || cutoff == null) {
            return;
        }
        revokedAtOrBefore.merge(userId, cutoff, (existing, next) -> next.isAfter(existing) ? next : existing);
        cleanupExpiredEntries(cutoff);
    }

    public boolean isRevoked(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            return false;
        }
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException ex) {
            return false;
        }
        if (blockedUsers.contains(userId)) {
            return true;
        }
        Instant cutoff = revokedAtOrBefore.get(userId);
        if (cutoff == null) {
            return false;
        }
        Instant issuedAt = jwt.getIssuedAt();
        if (issuedAt == null) {
            return true;
        }
        return !issuedAt.isAfter(cutoff);
    }

    private void cleanupExpiredEntries(Instant now) {
        if (revokedAtOrBefore.size() < 256) {
            return;
        }
        Instant staleThreshold = now.minusSeconds(RETENTION_SECONDS);
        revokedAtOrBefore.entrySet().removeIf(entry ->
                !blockedUsers.contains(entry.getKey()) && entry.getValue().isBefore(staleThreshold));
    }
}
