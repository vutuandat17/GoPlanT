package vn.goplant.backend.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.config.PageResponse;

@Service
public class AuthEventService {
    private static final Set<String> VALID_EVENT_TYPES = Set.of(
            "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "ADMIN_REVOKED", "PASSWORD_CHANGED");

    private static final RowMapper<AuthEventView> EVENT_MAPPER = (rs, row) -> new AuthEventView(
            rs.getObject("id", UUID.class),
            rs.getObject("user_id", UUID.class),
            rs.getString("user_email"),
            rs.getString("user_display_name"),
            rs.getObject("session_family_id", UUID.class),
            rs.getString("event_type"),
            rs.getString("platform"),
            rs.getString("device_label"),
            rs.getString("ip_address"),
            rs.getString("detail"),
            toInstant(rs.getTimestamp("created_at"))
    );

    private final JdbcTemplate jdbc;
    private final int retentionDays;

    public AuthEventService(
            JdbcTemplate jdbc,
            @Value("${goplant.auth.event-retention-days:90}") int retentionDays) {
        this.jdbc = jdbc;
        this.retentionDays = Math.max(1, retentionDays);
    }

    public int purgeExpiredEvents() {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        return jdbc.update("DELETE FROM user_auth_events WHERE created_at < ?", Timestamp.from(cutoff));
    }

    public void record(UUID userId, UUID sessionFamilyId, String eventType, AuthClientInfo client, String detail) {
        if (userId == null) return;
        AuthClientInfo safeClient = client == null ? AuthClientInfo.UNKNOWN : client;
        jdbc.update("""
                INSERT INTO user_auth_events(user_id, session_family_id, event_type, platform, device_label, ip_address, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                userId,
                sessionFamilyId,
                eventType,
                safeClient.platform(),
                safeClient.deviceLabel(),
                safeClient.ipAddress(),
                blankToNull(detail));
    }

    public PageResponse<AuthEventView> listForUser(UUID userId, int page, int size) {
        return listInternal(page, size, userId, null, null);
    }

    public PageResponse<AuthEventView> listForAdmin(int page, int size, UUID userId, String eventType, String q) {
        return listInternal(page, size, userId, eventType, q);
    }

    private PageResponse<AuthEventView> listInternal(int page, int size, UUID userId, String eventType, String q) {
        int safePage = PageResponse.normalizePage(page);
        int safeSize = PageResponse.normalizeSize(size);
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (userId != null) {
            where.append(" AND ev.user_id = ?");
            params.add(userId);
        }
        if (eventType != null && !eventType.isBlank()) {
            String normalized = eventType.trim().toUpperCase(Locale.ROOT);
            if (!VALID_EVENT_TYPES.contains(normalized)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Loại sự kiện đăng nhập không hợp lệ.");
            }
            where.append(" AND ev.event_type = ?");
            params.add(normalized);
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
            where.append(" AND (LOWER(u.display_name) LIKE ? OR LOWER(e.normalized_email) LIKE ? OR LOWER(COALESCE(ev.ip_address, '')) LIKE ?)");
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
        }

        Long total = jdbc.queryForObject("""
                SELECT count(*)
                FROM user_auth_events ev
                JOIN users u ON u.id = ev.user_id
                LEFT JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                """ + where,
                Long.class,
                params.toArray());
        long totalElements = total == null ? 0L : total;

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(safeSize);
        queryParams.add((long) safePage * safeSize);

        List<AuthEventView> items = jdbc.query("""
                SELECT ev.id,
                       ev.user_id,
                       e.normalized_email AS user_email,
                       u.display_name AS user_display_name,
                       ev.session_family_id,
                       ev.event_type,
                       ev.platform,
                       ev.device_label,
                       ev.ip_address,
                       ev.detail,
                       ev.created_at
                FROM user_auth_events ev
                JOIN users u ON u.id = ev.user_id
                LEFT JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                """ + where + " ORDER BY ev.created_at DESC LIMIT ? OFFSET ?",
                EVENT_MAPPER,
                queryParams.toArray());
        return PageResponse.of(items, safePage, safeSize, totalElements);
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record AuthClientInfo(String platform, String deviceLabel, String ipAddress) {
        public static final AuthClientInfo UNKNOWN = new AuthClientInfo("unknown", "Thiết bị chưa xác định", null);

        public static AuthClientInfo from(HttpServletRequest request, String clientPlatformHeader) {
            if (request == null) return UNKNOWN;
            String userAgent = request.getHeader("User-Agent");
            String platform = resolvePlatform(clientPlatformHeader, userAgent);
            String deviceLabel = summarizeDevice(platform, userAgent);
            String ip = resolveIp(request);
            return new AuthClientInfo(platform, deviceLabel, ip);
        }

        private static String resolvePlatform(String header, String userAgent) {
            if (header != null && !header.isBlank()) {
                String normalized = header.trim().toLowerCase(Locale.ROOT);
                if (normalized.equals("android") || normalized.equals("ios") || normalized.equals("web")) {
                    return normalized;
                }
            }
            if (userAgent == null) return "unknown";
            String ua = userAgent.toLowerCase(Locale.ROOT);
            if (ua.contains("android")) return "android";
            if (ua.contains("iphone") || ua.contains("ipad") || ua.contains("cfnetwork") || ua.contains("darwin")) return "ios";
            if (ua.contains("mozilla") || ua.contains("chrome") || ua.contains("safari") || ua.contains("firefox") || ua.contains("edg")) return "web";
            return "unknown";
        }

        private static String summarizeDevice(String platform, String userAgent) {
            if (userAgent == null || userAgent.isBlank()) {
                return switch (platform) {
                    case "android" -> "Ứng dụng Android";
                    case "ios" -> "Ứng dụng iOS";
                    case "web" -> "Trình duyệt Web";
                    default -> "Thiết bị chưa xác định";
                };
            }
            String ua = userAgent.toLowerCase(Locale.ROOT);
            if ("android".equals(platform)) {
                return ua.contains("expo") ? "Android (Expo)" : "Thiết bị Android";
            }
            if ("ios".equals(platform)) {
                return ua.contains("expo") ? "iOS (Expo)" : "Thiết bị iOS";
            }
            String browser = ua.contains("edg") ? "Edge"
                    : ua.contains("chrome") ? "Chrome"
                    : ua.contains("firefox") ? "Firefox"
                    : ua.contains("safari") ? "Safari"
                    : "Trình duyệt";
            String os = ua.contains("windows") ? "Windows"
                    : ua.contains("mac os") || ua.contains("macintosh") ? "macOS"
                    : ua.contains("linux") ? "Linux"
                    : "";
            String summary = os.isEmpty() ? browser : browser + " · " + os;
            return summary.length() > 160 ? summary.substring(0, 160) : summary;
        }

        private static String resolveIp(HttpServletRequest request) {
            String forwarded = request.getHeader("X-Forwarded-For");
            String raw = (forwarded != null && !forwarded.isBlank())
                    ? forwarded.split(",")[0].trim()
                    : request.getRemoteAddr();
            if (raw == null || raw.isBlank()) return null;
            return raw.length() > 64 ? raw.substring(0, 64) : raw;
        }
    }

    public record AuthEventView(
            UUID id,
            UUID userId,
            String userEmail,
            String userDisplayName,
            UUID sessionFamilyId,
            String eventType,
            String platform,
            String deviceLabel,
            String ipAddress,
            String detail,
            Instant createdAt) {}
}
