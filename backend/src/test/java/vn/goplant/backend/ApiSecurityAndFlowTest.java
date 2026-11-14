package vn.goplant.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
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
import vn.goplant.backend.catalog.PlantCatalogController;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
                "goplant.jwt.secret=test-only-jwt-secret-key-at-least-32-bytes-long"
        })
@AutoConfigureMockMvc
class ApiSecurityAndFlowTest {

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

    private String bearerToken(UUID userId, String role) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("goplant-api")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(900))
                .subject(userId.toString())
                .claim("role", role)
                .build();
        return "Bearer " + jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    @Test
    void openApiDocsArePubliclyAccessible() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("GoPlant API"));
    }

    @Test
    void catalogPlantsSupportsPaginationAndSearchWithoutAuth() throws Exception {
        UUID plantId = UUID.randomUUID();
        PlantCatalogController.Plant sample = new PlantCatalogController.Plant(
                plantId,
                "Trầu bà lá xẻ",
                "Monstera deliciosa",
                "Cây nội thất",
                null,
                null,
                null,
                null,
                "Nhựa cây có thể gây kích ứng nếu nuốt phải.",
                "Cây nhiệt đới lá xẻ đặc trưng.",
                "Trung Mỹ và Nam Mỹ",
                "Lá lớn xẻ thùy sâu.");

        when(jdbc.queryForObject(contains("SELECT count(*) FROM plant_catalog"), eq(Long.class), any(Object[].class)))
                .thenReturn(1L);
        when(jdbc.query(contains("FROM plant_catalog"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(sample));

        mockMvc.perform(get("/api/v1/catalog/plants")
                        .param("page", "0")
                        .param("size", "10")
                        .param("q", "monstera"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.items[0].scientificName").value("Monstera deliciosa"))
                .andExpect(jsonPath("$.items[0].origin").value("Trung Mỹ và Nam Mỹ"));
    }

    @Test
    void registerRejectsInvalidEmailAndCreatesPendingAccount() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"An","email":"invalid-email","password":"password123"}
                                """))
                .andExpect(status().isBadRequest());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_email_addresses"), eq(Integer.class), anyString()))
                .thenReturn(0);

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"Nguyen An","email":"an@goplant.test","password":"password123456"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("an@goplant.test"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void gardenAndPlantEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/gardens")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/plants")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminCatalogEndpointRejectsMemberAndAllowsAdmin() throws Exception {
        UUID memberId = UUID.randomUUID();
        mockMvc.perform(post("/api/v1/admin/catalog/plants")
                        .header("Authorization", bearerToken(memberId, "member"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"commonName":"Lưỡi hổ","scientificName":"Dracaena trifasciata","category":"Cây nội thất","sourceTitle":"Kew"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void authenticatedMemberCanListOwnPlantsAndCannotDeleteOthersGarden() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID foreignGardenId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM user_plants p"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?"), eq(Integer.class), eq(foreignGardenId), eq(userId)))
                .thenReturn(0);

        mockMvc.perform(get("/api/v1/plants")
                        .param("page", "0")
                        .param("size", "5")
                        .header("Authorization", memberBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(delete("/api/v1/gardens/{id}", foreignGardenId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());
    }
}
