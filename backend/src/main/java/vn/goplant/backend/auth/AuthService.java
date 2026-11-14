package vn.goplant.backend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import java.sql.Timestamp;
import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.care.CareScheduleService;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final JwtEncoder jwtEncoder;
    private final VerificationEmailSender verificationEmails;
    private final int tokenMinutes;
    private final int refreshTokenDays;
    private final boolean exposeVerificationToken;
    private final CareScheduleService careSchedules;
    private final SecureRandom random = new SecureRandom();

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwords, JwtEncoder jwtEncoder,
                       VerificationEmailSender verificationEmails, CareScheduleService careSchedules,
                       @Value("${goplant.jwt.access-token-minutes:15}") int tokenMinutes,
                       @Value("${goplant.jwt.refresh-token-days:30}") int refreshTokenDays,
                       @Value("${goplant.auth.expose-verification-token:false}") boolean exposeVerificationToken,
                       Environment environment) {
        if (exposeVerificationToken && Arrays.stream(environment.getActiveProfiles()).noneMatch("local"::equals)) {
            throw new IllegalStateException("Verification tokens may only be exposed with the local profile");
        }
        this.careSchedules = careSchedules;
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.jwtEncoder = jwtEncoder;
        this.verificationEmails = verificationEmails;
        this.tokenMinutes = tokenMinutes;
        this.refreshTokenDays = refreshTokenDays;
        this.exposeVerificationToken = exposeVerificationToken;
    }

    @Transactional
    public Registration register(String displayName, String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        UUID userId = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,display_name,password_hash,status) VALUES (?,?,?,'pending_verification')",
                userId, displayName.trim(), passwords.encode(password));
        jdbc.update("INSERT INTO user_email_addresses(user_id,normalized_email,address_type) VALUES (?,?,'primary')", userId, normalizedEmail);
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='user'", userId);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at) VALUES (?,'EMAIL_VERIFICATION',?,?)",
                userId, sha256(token), Timestamp.from(Instant.now().plus(24, ChronoUnit.HOURS)));
        if (!exposeVerificationToken) verificationEmails.sendVerification(normalizedEmail, token);
        return new Registration(userId, normalizedEmail, exposeVerificationToken ? token : null,
                exposeVerificationToken ? "Verify with the returned token (local development only)." : "Tài khoản đã tạo. Vui lòng mở email để xác minh trước khi đăng nhập.");
    }

    @Transactional
    public void verifyEmail(String token) {
        var matches = jdbc.query("""
                SELECT t.id AS token_id,t.user_id,e.id AS email_id
                FROM account_action_tokens t
                JOIN users u ON u.id=t.user_id
                JOIN user_email_addresses e ON e.user_id=u.id AND e.address_type='primary'
                WHERE t.token_hash=? AND t.purpose='EMAIL_VERIFICATION' AND t.consumed_at IS NULL
                  AND t.expires_at > now() AND u.status='pending_verification'
                FOR UPDATE OF t,u,e
                """, (rs, row) -> new Object[]{rs.getObject("token_id", UUID.class), rs.getObject("user_id", UUID.class), rs.getObject("email_id", UUID.class)}, sha256(token));
        if (matches.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired verification token");
        Object[] row = matches.getFirst();
        jdbc.update("UPDATE user_email_addresses SET verified_at=now() WHERE id=?", row[2]);
        jdbc.update("UPDATE users SET status='active',updated_at=now() WHERE id=?", row[1]);
        jdbc.update("UPDATE account_action_tokens SET consumed_at=now() WHERE id=?", row[0]);
    }

    @Transactional
    public LoginResult login(String email, String password) {
        String normalized = normalizeEmail(email);
        var rows = jdbc.query("""
                SELECT u.id,u.display_name,u.password_hash,u.status,u.timezone,e.normalized_email
                FROM users u JOIN user_email_addresses e ON e.user_id=u.id AND e.address_type='primary'
                WHERE e.normalized_email=?
                """, (rs, row) -> new Account(rs.getObject("id", UUID.class), rs.getString("display_name"),
                rs.getString("password_hash"), rs.getString("status"), rs.getString("normalized_email"), rs.getString("timezone")), normalized);
        if (rows.isEmpty() || !passwords.matches(password, rows.getFirst().passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.");
        }
        Account account = rows.getFirst();
        if (!"active".equals(account.status())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa.");
        String refreshToken = issueRefreshToken(account.id(), null);
        return buildLoginResult(account.id(), account.email(), account.displayName(), account.timezone(), refreshToken);
    }

    @Transactional
    public LoginResult refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thiếu refresh token.");
        }
        String hash = sha256(refreshToken.trim());
        var rows = jdbc.query("""
                SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
                       u.display_name, u.status, u.timezone, e.normalized_email
                FROM refresh_tokens rt
                JOIN users u ON u.id = rt.user_id
                JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                WHERE rt.token_hash = ?
                FOR UPDATE OF rt
                """, (rs, row) -> new RefreshRow(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant(),
                rs.getString("display_name"),
                rs.getString("status"),
                rs.getString("timezone"),
                rs.getString("normalized_email")), hash);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ.");
        }
        RefreshRow tokenRow = rows.getFirst();
        if (tokenRow.revokedAt() != null) {
            // Reuse of a rotated/revoked refresh token: revoke all active sessions for safety.
            revokeAllRefreshTokens(tokenRow.userId());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.");
        }
        if (tokenRow.expiresAt().isBefore(Instant.now())) {
            jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE id=?", tokenRow.id());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }
        if (!"active".equals(tokenRow.status())) {
            revokeAllRefreshTokens(tokenRow.userId());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tài khoản hiện không ở trạng thái hoạt động.");
        }

        UUID newTokenId = UUID.randomUUID();
        String newRefreshToken = issueRefreshToken(tokenRow.userId(), newTokenId);
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now(), replaced_by_token_id=?, last_used_at=now() WHERE id=?",
                newTokenId, tokenRow.id());
        return buildLoginResult(tokenRow.userId(), tokenRow.email(), tokenRow.displayName(), tokenRow.timezone(), newRefreshToken);
    }

    @Transactional
    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) return;
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=? AND revoked_at IS NULL",
                sha256(refreshToken.trim()));
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        var rows = jdbc.query("SELECT password_hash FROM users WHERE id=? AND status='active' FOR UPDATE",
                (rs, row) -> rs.getString("password_hash"), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy tài khoản.");
        String existingHash = rows.getFirst();
        if (!passwords.matches(currentPassword, existingHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu hiện tại không chính xác.");
        }
        if (passwords.matches(newPassword, existingHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu mới phải khác mật khẩu hiện tại.");
        }
        jdbc.update("UPDATE users SET password_hash=?, updated_at=now() WHERE id=?", passwords.encode(newPassword), userId);
        revokeAllRefreshTokens(userId);
    }

    @Transactional
    public ForgotPasswordResult forgotPassword(String email) {
        String normalized = normalizeEmail(email);
        var users = jdbc.query("""
                SELECT u.id FROM users u
                JOIN user_email_addresses e ON e.user_id = u.id AND e.address_type = 'primary'
                WHERE e.normalized_email = ? AND u.status = 'active'
                """, (rs, row) -> rs.getObject("id", UUID.class), normalized);
        String exposedToken = null;
        if (!users.isEmpty()) {
            UUID userId = users.getFirst();
            jdbc.update("""
                    UPDATE account_action_tokens SET consumed_at=now()
                    WHERE user_id=? AND purpose='PASSWORD_RESET' AND consumed_at IS NULL
                    """, userId);
            String token = generateSecureToken();
            jdbc.update("""
                    INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at)
                    VALUES (?,'PASSWORD_RESET',?,?)
                    """, userId, sha256(token), Timestamp.from(Instant.now().plus(60, ChronoUnit.MINUTES)));
            if (exposeVerificationToken) {
                exposedToken = token;
            } else {
                verificationEmails.sendPasswordReset(normalized, token);
            }
        }
        return new ForgotPasswordResult(
                exposedToken,
                exposeVerificationToken && exposedToken != null
                        ? "Sử dụng mã đặt lại mật khẩu trả về (chỉ dành cho môi trường phát triển)."
                        : "Nếu email đã được đăng ký và kích hoạt, hướng dẫn đặt lại mật khẩu đã được gửi tới hộp thư của bạn.");
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu mã đặt lại mật khẩu.");
        }
        var matches = jdbc.query("""
                SELECT t.id AS token_id, t.user_id
                FROM account_action_tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.token_hash = ? AND t.purpose = 'PASSWORD_RESET'
                  AND t.consumed_at IS NULL AND t.expires_at > now() AND u.status = 'active'
                FOR UPDATE OF t, u
                """, (rs, row) -> new UUID[]{rs.getObject("token_id", UUID.class), rs.getObject("user_id", UUID.class)},
                sha256(token.trim()));
        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Liên kết hoặc mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        }
        UUID tokenId = matches.getFirst()[0];
        UUID userId = matches.getFirst()[1];
        jdbc.update("UPDATE users SET password_hash=?, updated_at=now() WHERE id=?", passwords.encode(newPassword), userId);
        jdbc.update("UPDATE account_action_tokens SET consumed_at=now() WHERE id=?", tokenId);
        revokeAllRefreshTokens(userId);
    }

    private LoginResult buildLoginResult(UUID userId, String email, String displayName, String timezone, String refreshToken) {
        var roles = jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", String.class, userId);
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().issuer("goplant-api").subject(userId.toString())
                .issuedAt(now).expiresAt(now.plus(tokenMinutes, ChronoUnit.MINUTES))
                .claim("email", email).claim("name", displayName).claim("roles", roles).build();
        var header = JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build();
        String jwt = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new LoginResult(jwt, refreshToken, "Bearer", tokenMinutes * 60, new UserView(userId, email, displayName, roles, timezone));
    }

    private String issueRefreshToken(UUID userId, UUID explicitId) {
        UUID id = explicitId != null ? explicitId : UUID.randomUUID();
        String raw = generateSecureToken();
        jdbc.update("INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)",
                id, userId, sha256(raw), Timestamp.from(Instant.now().plus(refreshTokenDays, ChronoUnit.DAYS)));
        return raw;
    }

    private void revokeAllRefreshTokens(UUID userId) {
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=? AND revoked_at IS NULL", userId);
    }

    private String generateSecureToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public UserView getUser(UUID userId) {
        var rows = jdbc.query("""
                SELECT u.id,u.display_name,u.timezone,e.normalized_email
                FROM users u JOIN user_email_addresses e ON e.user_id=u.id AND e.address_type='primary'
                WHERE u.id=? AND u.status='active'
                """, (rs, row) -> new UserIdentity(rs.getObject("id", UUID.class), rs.getString("normalized_email"),
                rs.getString("display_name"), rs.getString("timezone")), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        UserIdentity identity = rows.getFirst();
        var roles = jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", String.class, userId);
        return new UserView(identity.id(), identity.email(), identity.displayName(), roles, identity.timezone());
    }

    /** Updates the account time zone (IANA id, e.g. Asia/Ho_Chi_Minh) and re-times pending care tasks. */
    @Transactional
    public UserView updateTimezone(UUID userId, String timezone) {
        String zone = timezone == null ? "" : timezone.trim();
        if (!ZoneId.getAvailableZoneIds().contains(zone)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Múi giờ không hợp lệ. Dùng mã IANA, ví dụ Asia/Ho_Chi_Minh.");
        }
        int changed = jdbc.update("UPDATE users SET timezone=?,updated_at=now() WHERE id=? AND status='active'", zone, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        careSchedules.applyUserTimezone(userId, zone);
        return getUser(userId);
    }

    @Transactional
    public UserView updateDisplayName(UUID userId, String displayName) {
        int changed = jdbc.update("UPDATE users SET display_name=?,updated_at=now() WHERE id=? AND status='active'", displayName.trim(), userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        return getUser(userId);
    }

    private String normalizeEmail(String email) {
        String result = email.trim().toLowerCase(Locale.ROOT);
        if (result.length() > 320 || !result.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address");
        return result;
    }

    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("SHA-256 is unavailable", ex); }
    }

    public record Registration(UUID id, String email, String verificationToken, String message) {}
    public record ForgotPasswordResult(String resetToken, String message) {}
    public record UserView(UUID id, String email, String displayName, java.util.List<String> roles, String timezone) {}
    public record LoginResult(String accessToken, String refreshToken, String tokenType, int expiresIn, UserView user) {}
    private record UserIdentity(UUID id, String email, String displayName, String timezone) {}
    private record Account(UUID id, String displayName, String passwordHash, String status, String email, String timezone) {}
    private record RefreshRow(UUID id, UUID userId, Instant expiresAt, Instant revokedAt, String displayName, String status, String timezone, String email) {}
}
