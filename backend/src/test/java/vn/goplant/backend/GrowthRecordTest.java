package vn.goplant.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import vn.goplant.backend.auth.VerificationEmailSender;
import vn.goplant.backend.monitoring.GrowthRecordController;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
                "goplant.jwt.secret=test-only-jwt-secret-key-at-least-32-bytes-long"
        })
@AutoConfigureMockMvc
class GrowthRecordTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtEncoder jwtEncoder;

    @MockitoBean
    private JdbcTemplate jdbc;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private VerificationEmailSender verificationEmails;

    private String bearerToken(UUID userId) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("goplant-api")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(900))
                .subject(userId.toString())
                .claim("role", "member")
                .build();
        return "Bearer " + jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    @Test
    void growthEndpointsRequireAuthAndCreateValidatesPayload() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        UUID recordId = UUID.randomUUID();
        String token = bearerToken(userId);

        mockMvc.perform(get("/api/v1/plants/{plantId}/growth-records", plantId))
                .andExpect(status().isUnauthorized());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants"), eq(Integer.class), eq(plantId), eq(userId)))
                .thenReturn(1);

        // Rejects empty metrics
        mockMvc.perform(post("/api/v1/plants/{plantId}/growth-records", plantId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recordedDate":"2026-11-18"}
                                """))
                .andExpect(status().isBadRequest());

        GrowthRecordController.GrowthRecord sample = new GrowthRecordController.GrowthRecord(
                recordId, plantId, LocalDate.of(2026, 11, 18), new BigDecimal("22.5"), 8, "budding", "Ra thêm 2 lá mới", Instant.now());

        when(jdbc.queryForObject(contains("FROM plant_growth_records WHERE id=?"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(sample);
        when(jdbc.query(contains("FROM plant_growth_records"), any(RowMapper.class), eq(plantId), eq(userId)))
                .thenReturn(List.of(sample));
        when(jdbc.update(contains("DELETE FROM plant_growth_records"), eq(recordId), eq(userId)))
                .thenReturn(1);

        mockMvc.perform(post("/api/v1/plants/{plantId}/growth-records", plantId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recordedDate":"2026-11-18","heightCm":22.5,"leafCount":8,"bloomStage":"budding","note":"Ra thêm 2 lá mới"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.heightCm").value(22.5))
                .andExpect(jsonPath("$.leafCount").value(8))
                .andExpect(jsonPath("$.bloomStage").value("budding"));

        mockMvc.perform(get("/api/v1/plants/{plantId}/growth-records", plantId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].heightCm").value(22.5));

        mockMvc.perform(delete("/api/v1/growth-records/{id}", recordId)
                        .header("Authorization", token))
                .andExpect(status().isNoContent());
    }
}
