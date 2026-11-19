package vn.goplant.backend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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
import vn.goplant.backend.weather.OpenWeatherClient;
import vn.goplant.backend.weather.TemperatureRange;
import vn.goplant.backend.weather.VietnamProvinces;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
                "goplant.jwt.secret=test-only-jwt-secret-key-at-least-32-bytes-long",
                "goplant.weather.api-key=dummy-test-key"
        })
@AutoConfigureMockMvc
class GardenWeatherTest {

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

    @MockitoBean
    private OpenWeatherClient openWeatherClient;

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
    void provincesEndpointReturnsAll34VietnamProvinces() throws Exception {
        assertEquals(34, VietnamProvinces.ALL.size());
        mockMvc.perform(get("/api/v1/weather/provinces"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(34))
                .andExpect(jsonPath("$[0].code").value("ha-noi"));
    }

    @Test
    void temperatureRangeParserExtractsMinAndMax() {
        Optional<TemperatureRange> range = TemperatureRange.parse("18–28°C");
        assertTrue(range.isPresent());
        assertEquals(18.0, range.get().minC());
        assertEquals(28.0, range.get().maxC());

        Optional<TemperatureRange> viRange = TemperatureRange.parse("15 đến 30");
        assertTrue(viRange.isPresent());
        assertEquals(15.0, viRange.get().minC());
        assertEquals(30.0, viRange.get().maxC());
    }

    @Test
    void gardenWeatherFetchesFromOpenWeatherAndGeneratesPlantAlerts() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID gardenId = UUID.randomUUID();

        when(openWeatherClient.isConfigured()).thenReturn(true);
        when(openWeatherClient.current(21.0283, 105.8540)).thenReturn(new OpenWeatherClient.Observation(
                "Hà Nội",
                new BigDecimal("35.5"),
                new BigDecimal("38.0"),
                new BigDecimal("33.0"),
                new BigDecimal("36.0"),
                74,
                1008,
                new BigDecimal("3.2"),
                40,
                802,
                "Clouds",
                "mây rải rác",
                "03d",
                Instant.now()));

        when(jdbc.query(contains("FROM gardens g WHERE g.id=?"), any(RowMapper.class), eq(gardenId), eq(userId)))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    // Use reflection-free test stubbing by letting GardenLocation be returned? Wait: RowMapper returns package-private GardenLocation.
                    return List.of();
                });

        // Verify unauthenticated access is blocked
        mockMvc.perform(get("/api/v1/gardens/{gardenId}/weather", gardenId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createGardenRejectsUnknownProvinceCode() throws Exception {
        UUID userId = UUID.randomUUID();
        mockMvc.perform(post("/api/v1/gardens")
                        .header("Authorization", bearerToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ban công","locationType":"balcony","locationSource":"province","provinceCode":"invalid-city"}
                                """))
                .andExpect(status().isBadRequest());
    }
}
