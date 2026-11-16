package vn.goplant.backend.config;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/health", "/actuator/health", "/actuator/health/**",
                                "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**",
                                "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/verify-email",
                                "/api/v1/auth/resend-verification",
                                "/api/v1/auth/refresh", "/api/v1/auth/logout",
                                "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/catalog/plants/**", "/api/v1/weather/provinces").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("admin")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        var authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthorityPrefix("ROLE_");
        authorities.setAuthoritiesClaimName("roles");
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    JwtEncoder jwtEncoder(@Value("${goplant.jwt.secret}") String secret) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(signingKey(secret)));
    }

    @Bean
    JwtDecoder jwtDecoder(@Value("${goplant.jwt.secret}") String secret) {
        return NimbusJwtDecoder.withSecretKey(signingKey(secret)).macAlgorithm(MacAlgorithm.HS256).build();
    }

    private SecretKey signingKey(String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) throw new IllegalStateException("GOPLANT_JWT_SECRET must be at least 32 bytes");
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
}
