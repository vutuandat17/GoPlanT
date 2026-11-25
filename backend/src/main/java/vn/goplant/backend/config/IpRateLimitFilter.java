package vn.goplant.backend.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-IP fixed-window rate limiter for public authentication endpoints
 * (login, register, forgot-password, resend-verification) to mitigate
 * credential stuffing, password spraying, and SMTP quota abuse.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class IpRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> RATE_LIMITED_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/resend-verification"
    );

    private final boolean enabled;
    private final int maxRequests;
    private final long windowSeconds;
    private final ConcurrentHashMap<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public IpRateLimitFilter(
            @Value("${goplant.auth.ip-rate-limit-enabled:true}") boolean enabled,
            @Value("${goplant.auth.ip-rate-limit-max-requests:25}") int maxRequests,
            @Value("${goplant.auth.ip-rate-limit-window-seconds:60}") long windowSeconds) {
        this.enabled = enabled;
        this.maxRequests = Math.max(1, maxRequests);
        this.windowSeconds = Math.max(1, windowSeconds);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!enabled || !"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        return !RATE_LIMITED_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String clientIp = resolveClientIp(request);
        String key = clientIp + "|" + request.getRequestURI();
        long nowSeconds = Instant.now().getEpochSecond();

        WindowCounter updated = counters.compute(key, (k, existing) -> {
            if (existing == null || nowSeconds - existing.windowStartEpochSec() >= windowSeconds) {
                return new WindowCounter(nowSeconds, 1);
            }
            return new WindowCounter(existing.windowStartEpochSec(), existing.count() + 1);
        });

        cleanupIfNeeded(nowSeconds);

        if (updated.count() > maxRequests) {
            long retryAfter = Math.max(1L, windowSeconds - (nowSeconds - updated.windowStartEpochSec()));
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType("application/problem+json;charset=UTF-8");
            response.getWriter().write("""
                    {"type":"about:blank","title":"Too Many Requests","status":429,"detail":"Bạn thao tác quá nhanh từ địa chỉ mạng này. Vui lòng thử lại sau %d giây.","instance":"%s"}"""
                    .formatted(retryAfter, escapeJson(request.getRequestURI())));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            String first = (comma >= 0 ? forwarded.substring(0, comma) : forwarded).trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    private void cleanupIfNeeded(long nowSeconds) {
        if (counters.size() < 512) {
            return;
        }
        counters.entrySet().removeIf(entry -> nowSeconds - entry.getValue().windowStartEpochSec() >= windowSeconds);
    }

    private static String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private record WindowCounter(long windowStartEpochSec, int count) {}
}
