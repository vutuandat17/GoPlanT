package vn.goplant.backend.auth;

import java.util.Locale;
import java.util.UUID;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(0)
public class BootstrapAdmin implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Environment environment;

    public BootstrapAdmin(JdbcTemplate jdbc, PasswordEncoder encoder, Environment environment) {
        this.jdbc = jdbc; this.encoder = encoder; this.environment = environment;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String email = environment.getProperty("GOPLANT_BOOTSTRAP_ADMIN_EMAIL", "admin@goplant.test");
        String password = environment.getProperty("GOPLANT_BOOTSTRAP_ADMIN_PASSWORD");
        if (password == null) return;
        if (password.length() < 8) {
            throw new IllegalStateException("Set GOPLANT_BOOTSTRAP_ADMIN_PASSWORD (at least 8 characters) to provision admin@goplant.test");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (jdbc.queryForObject("SELECT count(*) FROM user_email_addresses WHERE normalized_email=?", Integer.class, normalized) > 0) return;
        UUID userId = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,display_name,password_hash,status) VALUES (?,?,?,'active')", userId, "GoPlant Admin", encoder.encode(password));
        jdbc.update("INSERT INTO user_email_addresses(user_id,normalized_email,address_type,verified_at) VALUES (?,?,'primary',now())", userId, normalized);
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='admin'", userId);
    }
}
