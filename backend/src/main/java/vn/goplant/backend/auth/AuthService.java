package vn.goplant.backend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
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

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final JwtEncoder jwtEncoder;
    private final VerificationEmailSender verificationEmails;
    private final int tokenMinutes;
    private final boolean exposeVerificationToken;
    private final SecureRandom random = new SecureRandom();

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwords, JwtEncoder jwtEncoder,
                       VerificationEmailSender verificationEmails,
                       @Value("${goplant.jwt.access-token-minutes:15}") int tokenMinutes,
                       @Value("${goplant.auth.expose-verification-token:false}") boolean exposeVerificationToken,
                       Environment environment) {
        if (exposeVerificationToken && Arrays.stream(environment.getActiveProfiles()).noneMatch("local"::equals)) {
            throw new IllegalStateException("Verification tokens may only be exposed with the local profile");
        }
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.jwtEncoder = jwtEncoder;
        this.verificationEmails = verificationEmails;
        this.tokenMinutes = tokenMinutes;
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

    public LoginResult login(String email, String password) {
        String normalized = normalizeEmail(email);
        var rows = jdbc.query("""
                SELECT u.id,u.display_name,u.password_hash,u.status,e.normalized_email
                FROM users u JOIN user_email_addresses e ON e.user_id=u.id AND e.address_type='primary'
                WHERE e.normalized_email=?
                """, (rs, row) -> new Account(rs.getObject("id", UUID.class), rs.getString("display_name"),
                rs.getString("password_hash"), rs.getString("status"), rs.getString("normalized_email")), normalized);
        if (rows.isEmpty() || !passwords.matches(password, rows.getFirst().passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        Account account = rows.getFirst();
        if (!"active".equals(account.status())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is not active");
        var roles = jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", String.class, account.id());
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().issuer("goplant-api").subject(account.id().toString())
                .issuedAt(now).expiresAt(now.plus(tokenMinutes, ChronoUnit.MINUTES))
                .claim("email", account.email()).claim("name", account.displayName()).claim("roles", roles).build();
        var header = JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build();
        String jwt = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new LoginResult(jwt, "Bearer", tokenMinutes * 60, new UserView(account.id(), account.email(), account.displayName(), roles));
    }

    public UserView getUser(UUID userId) {
        var rows = jdbc.query("""
                SELECT u.id,u.display_name,e.normalized_email
                FROM users u JOIN user_email_addresses e ON e.user_id=u.id AND e.address_type='primary'
                WHERE u.id=? AND u.status='active'
                """, (rs, row) -> new UserIdentity(rs.getObject("id", UUID.class), rs.getString("normalized_email"),
                rs.getString("display_name")), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        UserIdentity identity = rows.getFirst();
        var roles = jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", String.class, userId);
        return new UserView(identity.id(), identity.email(), identity.displayName(), roles);
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
    public record UserView(UUID id, String email, String displayName, java.util.List<String> roles) {}
    public record LoginResult(String accessToken, String tokenType, int expiresIn, UserView user) {}
    private record UserIdentity(UUID id, String email, String displayName) {}
    private record Account(UUID id, String displayName, String passwordHash, String status, String email) {}
}
