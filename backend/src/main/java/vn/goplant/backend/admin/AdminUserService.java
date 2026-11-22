package vn.goplant.backend.admin;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.auth.AuthEventService;
import vn.goplant.backend.auth.AuthService;
import vn.goplant.backend.config.AccessTokenRevocationService;
import vn.goplant.backend.config.PageResponse;

@Service
public class AdminUserService {
    private static final long ADMIN_GUARD_LOCK_KEY = 2026112101L;
    private static final Set<String> VALID_STATUSES = Set.of("pending_verification", "active", "disabled", "locked");
    private static final Set<String> VALID_ROLES = Set.of("admin", "moderator", "user");
    private static final Set<String> VALID_ACTIVITIES = Set.of("recent", "inactive_30d", "never_logged_in");

    private static final String USER_SUMMARY_SELECT = """
            SELECT u.id,
                   e.normalized_email,
                   u.display_name,
                   u.status,
                   u.timezone,
                   e.verified_at AS email_verified_at,
                   u.last_login_at,
                   u.last_active_at,
                   u.created_at,
                   u.updated_at,
                   COALESCE((
                       SELECT array_agg(r.code ORDER BY r.code)
                       FROM user_roles ur
                       JOIN roles r ON r.id = ur.role_id
                       WHERE ur.user_id = u.id
                   ), ARRAY[]::varchar[]) AS roles,
                   (SELECT count(*) FROM gardens g WHERE g.owner_user_id = u.id) AS garden_count,
                   (SELECT count(*) FROM user_plants p WHERE p.owner_user_id = u.id AND p.archived_at IS NULL) AS plant_count,
                   (SELECT count(*) FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > now()) AS active_session_count
            FROM users u
            JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
            """;

    private static final RowMapper<AdminUserSummary> SUMMARY_MAPPER = (rs, row) -> new AdminUserSummary(
            rs.getObject("id", UUID.class),
            rs.getString("normalized_email"),
            rs.getString("display_name"),
            rs.getString("status"),
            rs.getString("timezone"),
            readStringArray(rs, "roles"),
            toInstant(rs.getTimestamp("email_verified_at")),
            rs.getLong("garden_count"),
            rs.getLong("plant_count"),
            rs.getLong("active_session_count"),
            toInstant(rs.getTimestamp("last_login_at")),
            toInstant(rs.getTimestamp("last_active_at")),
            toInstant(rs.getTimestamp("created_at")),
            toInstant(rs.getTimestamp("updated_at"))
    );

    private static final RowMapper<AuditLogEntry> AUDIT_MAPPER = (rs, row) -> new AuditLogEntry(
            rs.getObject("id", UUID.class),
            rs.getObject("actor_user_id", UUID.class),
            rs.getString("actor_email"),
            rs.getString("actor_display_name"),
            rs.getObject("target_user_id", UUID.class),
            rs.getString("target_email"),
            rs.getString("target_display_name"),
            rs.getString("action"),
            rs.getString("previous_value"),
            rs.getString("new_value"),
            rs.getString("reason"),
            toInstant(rs.getTimestamp("created_at"))
    );

    private final JdbcTemplate jdbc;
    private final AuthEventService authEvents;
    private final AuthService authService;
    private final AccessTokenRevocationService tokenRevocations;

    public AdminUserService(
            JdbcTemplate jdbc,
            AuthEventService authEvents,
            AuthService authService,
            AccessTokenRevocationService tokenRevocations) {
        this.jdbc = jdbc;
        this.authEvents = authEvents;
        this.authService = authService;
        this.tokenRevocations = tokenRevocations;
    }

    public AdminUserStats getStats() {
        return jdbc.queryForObject("""
                SELECT count(*) AS total_users,
                       count(*) FILTER (WHERE u.status = 'active') AS active_users,
                       count(*) FILTER (WHERE u.status = 'pending_verification') AS pending_users,
                       count(*) FILTER (WHERE u.status IN ('locked', 'disabled')) AS locked_or_disabled_users,
                       count(*) FILTER (WHERE EXISTS (
                           SELECT 1 FROM user_roles ur
                           JOIN roles r ON r.id = ur.role_id
                           WHERE ur.user_id = u.id AND r.code = 'admin'
                       )) AS admin_users,
                       count(*) FILTER (WHERE u.created_at >= now() - interval '7 days') AS new_users_7d,
                       count(*) FILTER (WHERE u.last_active_at >= now() - interval '7 days') AS active_7d
                FROM users u
                """, (rs, row) -> new AdminUserStats(
                rs.getLong("total_users"),
                rs.getLong("active_users"),
                rs.getLong("pending_users"),
                rs.getLong("locked_or_disabled_users"),
                rs.getLong("admin_users"),
                rs.getLong("new_users_7d"),
                rs.getLong("active_7d")));
    }

    public PageResponse<AdminUserSummary> listUsers(int page, int size, String q, String status, String role, String activity) {
        int safePage = PageResponse.normalizePage(page);
        int safeSize = PageResponse.normalizeSize(size);
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
            where.append(" AND (LOWER(u.display_name) LIKE ? OR LOWER(e.normalized_email) LIKE ?)");
            params.add(pattern);
            params.add(pattern);
        }
        if (status != null && !status.isBlank()) {
            String normalizedStatus = status.trim().toLowerCase(Locale.ROOT);
            if (!VALID_STATUSES.contains(normalizedStatus)) {
                throw badRequest("Trạng thái lọc không hợp lệ.");
            }
            where.append(" AND u.status = ?");
            params.add(normalizedStatus);
        }
        if (role != null && !role.isBlank()) {
            String normalizedRole = role.trim().toLowerCase(Locale.ROOT);
            if (!VALID_ROLES.contains(normalizedRole)) {
                throw badRequest("Vai trò lọc không hợp lệ.");
            }
            where.append(" AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)");
            params.add(normalizedRole);
        }
        if (activity != null && !activity.isBlank()) {
            String normalizedActivity = activity.trim().toLowerCase(Locale.ROOT);
            if (!VALID_ACTIVITIES.contains(normalizedActivity)) {
                throw badRequest("Bộ lọc mức độ sử dụng không hợp lệ.");
            }
            switch (normalizedActivity) {
                case "recent" -> where.append(" AND u.last_active_at >= now() - interval '7 days'");
                case "inactive_30d" -> where.append(" AND u.last_login_at IS NOT NULL AND (u.last_active_at IS NULL OR u.last_active_at < now() - interval '30 days')");
                case "never_logged_in" -> where.append(" AND u.last_login_at IS NULL");
                default -> throw badRequest("Bộ lọc mức độ sử dụng không hợp lệ.");
            }
        }

        Long total = jdbc.queryForObject(
                "SELECT count(*) FROM users u JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'" + where,
                Long.class,
                params.toArray());
        long totalElements = total == null ? 0L : total;

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(safeSize);
        queryParams.add((long) safePage * safeSize);

        List<AdminUserSummary> items = jdbc.query(
                USER_SUMMARY_SELECT + where + " ORDER BY u.created_at DESC LIMIT ? OFFSET ?",
                SUMMARY_MAPPER,
                queryParams.toArray());
        return PageResponse.of(items, safePage, safeSize, totalElements);
    }

    public AdminUserDetail getUser(UUID targetUserId) {
        var rows = jdbc.query(USER_SUMMARY_SELECT + " WHERE u.id = ?", SUMMARY_MAPPER, targetUserId);
        if (rows.isEmpty()) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        AdminUserSummary summary = rows.getFirst();
        List<AuditLogEntry> recentLogs = listAuditLogs(0, 20, targetUserId, null).items();
        return new AdminUserDetail(
                summary.id(),
                summary.email(),
                summary.displayName(),
                summary.status(),
                summary.timezone(),
                summary.roles(),
                summary.emailVerifiedAt(),
                summary.gardenCount(),
                summary.plantCount(),
                summary.activeSessionCount(),
                summary.lastLoginAt(),
                summary.lastActiveAt(),
                summary.createdAt(),
                summary.updatedAt(),
                recentLogs
        );
    }

    @Transactional
    public AdminUserDetail updateStatus(UUID actorUserId, UUID targetUserId, UpdateStatusRequest request) {
        if (actorUserId.equals(targetUserId)) {
            throw badRequest("Không thể tự thay đổi trạng thái tài khoản của chính mình.");
        }
        String newStatus = request.status().trim().toLowerCase(Locale.ROOT);
        acquireAdminGuardLock();

        var statusRows = jdbc.queryForList("SELECT status FROM users WHERE id = ? FOR UPDATE", String.class, targetUserId);
        if (statusRows.isEmpty()) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        String currentStatus = statusRows.getFirst();
        if (currentStatus.equals(newStatus)) {
            return getUser(targetUserId);
        }

        boolean targetIsActiveAdmin = "active".equals(currentStatus) && hasRole(targetUserId, "admin");
        if (targetIsActiveAdmin && ("locked".equals(newStatus) || "disabled".equals(newStatus))) {
            ensureMoreThanOneActiveAdmin("Không thể khóa hoặc vô hiệu hóa quản trị viên hoạt động cuối cùng.");
        }

        jdbc.update("UPDATE users SET status = ?, updated_at = now() WHERE id = ?", newStatus, targetUserId);

        if ("active".equals(newStatus) && "pending_verification".equals(currentStatus)) {
            jdbc.update("""
                    UPDATE user_email_addresses
                    SET verified_at = COALESCE(verified_at, now())
                    WHERE user_id = ? AND address_type = 'primary'
                    """, targetUserId);
        }

        if ("locked".equals(newStatus) || "disabled".equals(newStatus)) {
            int revoked = jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", targetUserId);
            tokenRevocations.blockUser(targetUserId);
            if (revoked > 0) {
                authEvents.record(targetUserId, null, "ADMIN_REVOKED", null,
                        "Tài khoản chuyển sang " + newStatus + (blankToNull(request.reason()) != null ? " · " + request.reason().trim() : ""));
            }
        } else if ("active".equals(newStatus)) {
            tokenRevocations.unblockUser(targetUserId);
        }

        String action = switch (newStatus) {
            case "locked" -> "LOCK_USER";
            case "disabled" -> "DISABLE_USER";
            case "active" -> "locked".equals(currentStatus) ? "UNLOCK_USER" : "ACTIVATE_USER";
            default -> throw badRequest("Trạng thái không hợp lệ.");
        };
        insertAuditLog(actorUserId, targetUserId, action, currentStatus, newStatus, request.reason());
        return getUser(targetUserId);
    }

    @Transactional
    public AdminUserDetail updateAdminRole(UUID actorUserId, UUID targetUserId, UpdateAdminRoleRequest request) {
        if (request.admin() == null && request.moderator() == null) {
            throw badRequest("Vui lòng chỉ định vai trò cần cập nhật.");
        }
        if (actorUserId.equals(targetUserId) && Boolean.FALSE.equals(request.admin())) {
            throw badRequest("Không thể tự thu hồi quyền quản trị viên của chính mình.");
        }
        acquireAdminGuardLock();

        var statusRows = jdbc.queryForList("SELECT status FROM users WHERE id = ? FOR UPDATE", String.class, targetUserId);
        if (statusRows.isEmpty()) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        String status = statusRows.getFirst();

        if (request.admin() != null) {
            boolean grantAdmin = request.admin();
            boolean currentlyAdmin = hasRole(targetUserId, "admin");
            if (grantAdmin) {
                if (!"active".equals(status)) {
                    throw badRequest("Chỉ có thể cấp quyền quản trị cho tài khoản đang ở trạng thái hoạt động.");
                }
                if (!currentlyAdmin) {
                    jdbc.update("""
                            INSERT INTO user_roles(user_id, role_id, assigned_by)
                            SELECT ?, id, ? FROM roles WHERE code = 'admin'
                            ON CONFLICT (user_id, role_id) DO NOTHING
                            """, targetUserId, actorUserId);
                    insertAuditLog(actorUserId, targetUserId, "GRANT_ADMIN", "user", "admin", request.reason());
                }
            } else if (currentlyAdmin) {
                if ("active".equals(status)) {
                    ensureMoreThanOneActiveAdmin("Không thể thu hồi quyền của quản trị viên hoạt động cuối cùng.");
                }
                jdbc.update("""
                        DELETE FROM user_roles
                        WHERE user_id = ? AND role_id = (SELECT id FROM roles WHERE code = 'admin')
                        """, targetUserId);
                tokenRevocations.revokeTokensAtOrBefore(targetUserId, Instant.now());
                insertAuditLog(actorUserId, targetUserId, "REVOKE_ADMIN", "admin", "user", request.reason());
            }
        }

        if (request.moderator() != null) {
            boolean grantModerator = request.moderator();
            boolean currentlyModerator = hasRole(targetUserId, "moderator");
            if (grantModerator) {
                if (!"active".equals(status)) {
                    throw badRequest("Chỉ có thể cấp quyền kiểm duyệt viên cho tài khoản đang ở trạng thái hoạt động.");
                }
                if (!currentlyModerator) {
                    jdbc.update("""
                            INSERT INTO user_roles(user_id, role_id, assigned_by)
                            SELECT ?, id, ? FROM roles WHERE code = 'moderator'
                            ON CONFLICT (user_id, role_id) DO NOTHING
                            """, targetUserId, actorUserId);
                    insertAuditLog(actorUserId, targetUserId, "GRANT_MODERATOR", "user", "moderator", request.reason());
                }
            } else if (currentlyModerator) {
                jdbc.update("""
                        DELETE FROM user_roles
                        WHERE user_id = ? AND role_id = (SELECT id FROM roles WHERE code = 'moderator')
                        """, targetUserId);
                tokenRevocations.revokeTokensAtOrBefore(targetUserId, Instant.now());
                insertAuditLog(actorUserId, targetUserId, "REVOKE_MODERATOR", "moderator", "user", request.reason());
            }
        }

        return getUser(targetUserId);
    }

    @Transactional
    public AdminUserDetail revokeSessions(UUID actorUserId, UUID targetUserId, String reason) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, targetUserId);
        if (exists == null || exists == 0) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        int revoked = jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", targetUserId);
        tokenRevocations.revokeTokensAtOrBefore(targetUserId, Instant.now());
        insertAuditLog(actorUserId, targetUserId, "REVOKE_SESSIONS", null, revoked + " phiên", reason);
        authEvents.record(targetUserId, null, "ADMIN_REVOKED", null,
                "Admin thu hồi " + revoked + " phiên đăng nhập" + (blankToNull(reason) != null ? " · " + reason.trim() : ""));
        return getUser(targetUserId);
    }

    @Transactional
    public AdminResendVerificationResponse resendVerification(UUID actorUserId, UUID targetUserId, String reason) {
        var rows = jdbc.query("""
                SELECT u.status, e.normalized_email
                FROM users u
                JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                WHERE u.id = ?
                """, (rs, row) -> new UserEmailStatusRow(rs.getString("status"), rs.getString("normalized_email")), targetUserId);
        if (rows.isEmpty()) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        UserEmailStatusRow target = rows.getFirst();
        if (!"pending_verification".equals(target.status())) {
            throw badRequest("Chỉ có thể gửi lại email xác minh cho tài khoản đang ở trạng thái chờ xác minh.");
        }
        AuthService.ResendVerificationResult result = authService.resendVerification(target.email());
        insertAuditLog(actorUserId, targetUserId, "RESEND_VERIFICATION", null, target.email(), reason);
        return new AdminResendVerificationResponse(getUser(targetUserId), result.message(), result.verificationToken());
    }

    @Transactional
    public AdminPasswordResetResponse sendPasswordReset(UUID actorUserId, UUID targetUserId, String reason) {
        var rows = jdbc.query("""
                SELECT u.status, e.normalized_email
                FROM users u
                JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                WHERE u.id = ?
                """, (rs, row) -> new UserEmailStatusRow(rs.getString("status"), rs.getString("normalized_email")), targetUserId);
        if (rows.isEmpty()) {
            throw notFound("Không tìm thấy tài khoản người dùng.");
        }
        UserEmailStatusRow target = rows.getFirst();
        if (!"active".equals(target.status())) {
            throw badRequest("Chỉ có thể gửi email đặt lại mật khẩu cho tài khoản đang ở trạng thái hoạt động.");
        }
        AuthService.ForgotPasswordResult result = authService.forgotPassword(target.email());
        insertAuditLog(actorUserId, targetUserId, "SEND_PASSWORD_RESET", null, target.email(), reason);
        return new AdminPasswordResetResponse(getUser(targetUserId), result.message(), result.resetToken());
    }

    public PageResponse<AuditLogEntry> listAuditLogs(int page, int size, UUID targetUserId, String action) {
        int safePage = PageResponse.normalizePage(page);
        int safeSize = PageResponse.normalizeSize(size);
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (targetUserId != null) {
            where.append(" AND l.target_user_id = ?");
            params.add(targetUserId);
        }
        if (action != null && !action.isBlank()) {
            where.append(" AND l.action = ?");
            params.add(action.trim().toUpperCase(Locale.ROOT));
        }

        Long total = jdbc.queryForObject("SELECT count(*) FROM admin_audit_logs l" + where, Long.class, params.toArray());
        long totalElements = total == null ? 0L : total;

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(safeSize);
        queryParams.add((long) safePage * safeSize);

        List<AuditLogEntry> items = jdbc.query("""
                SELECT l.id,
                       l.actor_user_id,
                       ae.normalized_email AS actor_email,
                       au.display_name AS actor_display_name,
                       l.target_user_id,
                       te.normalized_email AS target_email,
                       tu.display_name AS target_display_name,
                       l.action,
                       l.previous_value,
                       l.new_value,
                       l.reason,
                       l.created_at
                FROM admin_audit_logs l
                LEFT JOIN users au ON au.id = l.actor_user_id
                LEFT JOIN user_email_addresses ae ON ae.user_id = l.actor_user_id AND ae.address_type = 'primary'
                JOIN users tu ON tu.id = l.target_user_id
                LEFT JOIN user_email_addresses te ON te.user_id = l.target_user_id AND te.address_type = 'primary'
                """ + where + " ORDER BY l.created_at DESC LIMIT ? OFFSET ?",
                AUDIT_MAPPER,
                queryParams.toArray());
        return PageResponse.of(items, safePage, safeSize, totalElements);
    }

    private void acquireAdminGuardLock() {
        jdbc.execute("SELECT pg_advisory_xact_lock(" + ADMIN_GUARD_LOCK_KEY + ")");
    }

    private boolean hasRole(UUID userId, String roleCode) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*)
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = ? AND r.code = ?
                """, Integer.class, userId, roleCode);
        return count != null && count > 0;
    }

    private void ensureMoreThanOneActiveAdmin(String errorMessage) {
        Integer activeAdmins = jdbc.queryForObject("""
                SELECT count(DISTINCT u.id)
                FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r ON r.id = ur.role_id
                WHERE r.code = 'admin' AND u.status = 'active'
                """, Integer.class);
        if (activeAdmins == null || activeAdmins <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, errorMessage);
        }
    }

    private void insertAuditLog(UUID actorUserId, UUID targetUserId, String action, String previousValue, String newValue, String reason) {
        jdbc.update("""
                INSERT INTO admin_audit_logs(actor_user_id, target_user_id, action, previous_value, new_value, reason)
                VALUES (?, ?, ?, ?, ?, ?)
                """, actorUserId, targetUserId, action, previousValue, newValue, blankToNull(reason));
    }

    private static List<String> readStringArray(ResultSet rs, String column) throws SQLException {
        Array sqlArray = rs.getArray(column);
        if (sqlArray == null) return List.of();
        Object raw = sqlArray.getArray();
        if (raw instanceof String[] strings) return Arrays.asList(strings);
        if (raw instanceof Object[] objects) {
            return Arrays.stream(objects).map(String::valueOf).toList();
        }
        return List.of();
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    public record UpdateStatusRequest(
            @NotBlank @Pattern(regexp = "active|locked|disabled", message = "Trạng thái phải là active, locked hoặc disabled.") String status,
            @Size(max = 500) String reason) {}

    public record UpdateAdminRoleRequest(
            Boolean admin,
            Boolean moderator,
            @Size(max = 500) String reason) {}

    public record RevokeSessionsRequest(@Size(max = 500) String reason) {}

    public record AdminUserStats(
            long totalUsers,
            long activeUsers,
            long pendingUsers,
            long lockedOrDisabledUsers,
            long adminUsers,
            long newUsersLast7Days,
            long recentActiveUsers7Days) {}

    public record AdminUserSummary(
            UUID id,
            String email,
            String displayName,
            String status,
            String timezone,
            List<String> roles,
            Instant emailVerifiedAt,
            long gardenCount,
            long plantCount,
            long activeSessionCount,
            Instant lastLoginAt,
            Instant lastActiveAt,
            Instant createdAt,
            Instant updatedAt) {}

    public record AdminUserDetail(
            UUID id,
            String email,
            String displayName,
            String status,
            String timezone,
            List<String> roles,
            Instant emailVerifiedAt,
            long gardenCount,
            long plantCount,
            long activeSessionCount,
            Instant lastLoginAt,
            Instant lastActiveAt,
            Instant createdAt,
            Instant updatedAt,
            List<AuditLogEntry> recentAuditLogs) {}

    public record AuditLogEntry(
            UUID id,
            UUID actorUserId,
            String actorEmail,
            String actorDisplayName,
            UUID targetUserId,
            String targetEmail,
            String targetDisplayName,
            String action,
            String previousValue,
            String newValue,
            String reason,
            Instant createdAt) {}

    private record UserEmailStatusRow(String status, String email) {}

    public record AdminResendVerificationResponse(
            AdminUserDetail user,
            String message,
            String verificationToken) {}

    public record AdminPasswordResetResponse(
            AdminUserDetail user,
            String message,
            String resetToken) {}
}
