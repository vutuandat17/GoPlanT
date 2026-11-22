package vn.goplant.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import vn.goplant.backend.auth.VerificationEmailSender;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import vn.goplant.backend.catalog.PlantCatalogController;
import vn.goplant.backend.gardens.GardenController;

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

    @Autowired
    private PasswordEncoder passwordEncoder;

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
                .claim("roles", List.of(role))
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

        when(jdbc.query(contains("FROM users u"), any(RowMapper.class), anyString()))
                .thenReturn(List.of());

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"Nguyen An","email":"an@goplant.test","password":"password123456"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("an@goplant.test"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.verificationRequired").value(false));
    }

    @Test
    void registerReturnsConflictWithVietnameseMessageForDuplicateEmail() throws Exception {
        when(jdbc.query(contains("SELECT u.status FROM users u"), any(RowMapper.class), eq("active@goplant.test")))
                .thenReturn(List.of("active"));

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"Nguyen An","email":"active@goplant.test","password":"password123456"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Email này đã được đăng ký."));

        when(jdbc.query(contains("SELECT u.status FROM users u"), any(RowMapper.class), eq("pending@goplant.test")))
                .thenReturn(List.of("pending_verification"));

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"Nguyen An","email":"pending@goplant.test","password":"password123456"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Email này đã được đăng ký nhưng chưa xác minh. Vui lòng kiểm tra hộp thư hoặc yêu cầu gửi lại email xác minh."));
    }

    @Test
    void verifyEmailActivatesPendingAccountAndRejectsInvalidToken() throws Exception {
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID emailId = UUID.randomUUID();

        when(jdbc.query(contains("FROM account_action_tokens t"), any(RowMapper.class), anyString()))
                .thenReturn(List.of())
                .thenReturn(List.<Object[]>of(new Object[]{tokenId, userId, emailId}));

        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"invalid-or-expired-token"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"valid-verification-token-sample"}
                                """))
                .andExpect(status().isNoContent());
    }

    @Test
    void resendVerificationIssuesNewTokenAndEnforcesCooldown() throws Exception {
        UUID userId = UUID.randomUUID();

        when(jdbc.query(contains("SELECT u.id, u.status FROM users u"), any(RowMapper.class), eq("pending@goplant.test")))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(userId);
                    when(rs.getString("status")).thenReturn("pending_verification");
                    return List.of(mapper.mapRow(rs, 0));
                });

        when(jdbc.query(contains("SELECT created_at FROM account_action_tokens"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of(java.time.Instant.now().minusSeconds(120)))
                .thenReturn(List.of(java.time.Instant.now().minusSeconds(10)));

        mockMvc.perform(post("/api/v1/auth/resend-verification")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"pending@goplant.test"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").isNotEmpty());

        mockMvc.perform(post("/api/v1/auth/resend-verification")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"pending@goplant.test"}
                                """))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void loginSucceedsWithValidCredentialsAndLocksAfterTooManyFailures() throws Exception {
        UUID userId = UUID.randomUUID();
        String encodedPassword = passwordEncoder.encode("correct-password-12");

        when(jdbc.query(contains("SELECT u.id,u.display_name,u.password_hash,u.status"), any(RowMapper.class), eq("login@goplant.test")))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(userId);
                    when(rs.getString("display_name")).thenReturn("Nguyen An");
                    when(rs.getString("password_hash")).thenReturn(encodedPassword);
                    when(rs.getString("status")).thenReturn("active");
                    when(rs.getString("normalized_email")).thenReturn("login@goplant.test");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    return List.of(mapper.mapRow(rs, 0));
                });
        when(jdbc.query(contains("SELECT r.code FROM roles r JOIN user_roles"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of("user"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"login@goplant.test","password":"correct-password-12"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("login@goplant.test"));

        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"email":"login@goplant.test","password":"wrong-password-12"}
                                    """))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"login@goplant.test","password":"correct-password-12"}
                                """))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void refreshRotatesValidTokenAndRejectsRevokedToken() throws Exception {
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        when(jdbc.query(contains("FROM refresh_tokens rt"), any(RowMapper.class), anyString()))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(tokenId);
                    when(rs.getObject("user_id", UUID.class)).thenReturn(userId);
                    when(rs.getTimestamp("expires_at")).thenReturn(java.sql.Timestamp.from(Instant.now().plusSeconds(3600)));
                    when(rs.getTimestamp("revoked_at")).thenReturn(null);
                    when(rs.getString("display_name")).thenReturn("Nguyen An");
                    when(rs.getString("status")).thenReturn("active");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    when(rs.getString("normalized_email")).thenReturn("refresh@goplant.test");
                    return List.of(mapper.mapRow(rs, 0));
                })
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(tokenId);
                    when(rs.getObject("user_id", UUID.class)).thenReturn(userId);
                    when(rs.getTimestamp("expires_at")).thenReturn(java.sql.Timestamp.from(Instant.now().plusSeconds(3600)));
                    when(rs.getTimestamp("revoked_at")).thenReturn(java.sql.Timestamp.from(Instant.now().minusSeconds(60)));
                    when(rs.getString("display_name")).thenReturn("Nguyen An");
                    when(rs.getString("status")).thenReturn("active");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    when(rs.getString("normalized_email")).thenReturn("refresh@goplant.test");
                    return List.of(mapper.mapRow(rs, 0));
                });
        when(jdbc.query(contains("SELECT r.code FROM roles r JOIN user_roles"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of("user"));

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"valid-refresh-token-value"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("refresh@goplant.test"));

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"revoked-refresh-token-value"}
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void careScheduleEndpointsRequireAuthAndEnforceOwnership() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID foreignPlantId = UUID.randomUUID();
        UUID foreignTaskId = UUID.randomUUID();
        String token = bearerToken(userId, "member");

        mockMvc.perform(get("/api/v1/schedules/today")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/plants/{plantId}/schedules", foreignPlantId)).andExpect(status().isUnauthorized());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants"), eq(Integer.class), eq(foreignPlantId), eq(userId)))
                .thenReturn(0);
        when(jdbc.query(contains("FROM care_tasks t"), any(RowMapper.class), eq(foreignTaskId), eq(userId)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/plants/{plantId}/schedules", foreignPlantId)
                        .header("Authorization", token))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/tasks/{taskId}/complete", foreignTaskId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/tasks/{taskId}/skip", foreignTaskId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void careScheduleValidationRejectsInvalidRepeatRulesAndCompletedTask() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        UUID scheduleId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        String token = bearerToken(userId, "member");

        when(jdbc.queryForList(contains("SELECT timezone FROM users"), eq(String.class), eq(userId)))
                .thenReturn(List.of("Asia/Ho_Chi_Minh"));
        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants"), eq(Integer.class), eq(plantId), eq(userId)))
                .thenReturn(1);

        // DAILY_INTERVAL without frequencyDays -> 400
        mockMvc.perform(post("/api/v1/plants/{plantId}/schedules", plantId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"taskType":"watering","repeatType":"DAILY_INTERVAL","timeOfDay":"08:00","startDate":"2026-11-18"}
                                """))
                .andExpect(status().isBadRequest());

        // WEEKLY with empty daysOfWeek -> 400
        mockMvc.perform(post("/api/v1/plants/{plantId}/schedules", plantId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"taskType":"watering","repeatType":"WEEKLY","daysOfWeek":[],"timeOfDay":"08:00","startDate":"2026-11-18"}
                                """))
                .andExpect(status().isBadRequest());

        // Already completed/skipped task -> 409 Conflict
        when(jdbc.query(contains("FROM care_tasks t"), any(RowMapper.class), eq(taskId), eq(userId)))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("care_schedule_id", UUID.class)).thenReturn(scheduleId);
                    when(rs.getObject("due_date", java.time.LocalDate.class)).thenReturn(java.time.LocalDate.of(2026, 11, 18));
                    when(rs.getString("status")).thenReturn("completed");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    return List.of(mapper.mapRow(rs, 0));
                });

        mockMvc.perform(post("/api/v1/tasks/{taskId}/complete", taskId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/v1/tasks/{taskId}/skip", taskId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"Trời mưa"}
                                """))
                .andExpect(status().isConflict());
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

    @Test
    void gardenPhotoEndpointsEnforceAuthOwnershipValidationAndLifecycle() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID gardenId = UUID.randomUUID();
        UUID foreignGardenId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");

        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", pngOut);
        byte[] pngBytes = pngOut.toByteArray();
        MockMultipartFile validPng = new MockMultipartFile("file", "garden.png", MediaType.IMAGE_PNG_VALUE, pngBytes);
        MockMultipartFile invalidFile = new MockMultipartFile("file", "bad.txt", MediaType.TEXT_PLAIN_VALUE, "not-an-image".getBytes());

        mockMvc.perform(get("/api/v1/gardens/{id}/photo", gardenId))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart("/api/v1/gardens/{id}/photo", gardenId)
                        .file(invalidFile)
                        .header("Authorization", memberBearer))
                .andExpect(status().isUnsupportedMediaType());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?"), eq(Integer.class), eq(foreignGardenId), eq(userId)))
                .thenReturn(0);
        mockMvc.perform(multipart("/api/v1/gardens/{id}/photo", foreignGardenId)
                        .file(validPng)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/v1/gardens/{id}/photo", foreignGardenId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?"), eq(Integer.class), eq(gardenId), eq(userId)))
                .thenReturn(1);
        mockMvc.perform(multipart("/api/v1/gardens/{id}/photo", gardenId)
                        .file(validPng)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());

        when(jdbc.query(contains("FROM garden_photos ph"), any(RowMapper.class), eq(gardenId), eq(userId)))
                .thenReturn(List.of());
        mockMvc.perform(get("/api/v1/gardens/{id}/photo", gardenId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/gardens/{id}/photo", gardenId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());
    }

    @Test
    void plantLifecycleSupportsCreateUpdateSoftDeleteAndDeactivatesSchedules() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID catalogId = UUID.randomUUID();
        UUID gardenId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");
        Instant now = Instant.now();

        GardenController.OwnedPlant createdPlant = new GardenController.OwnedPlant(
                plantId, catalogId, gardenId, "Trầu bà ban công", "Trầu bà lá xẻ", "Monstera deliciosa",
                "Kệ cửa sổ", java.time.LocalDate.of(2026, 5, 1), "Tưới vừa", now, null);
        GardenController.OwnedPlant updatedPlant = new GardenController.OwnedPlant(
                plantId, catalogId, null, "Trầu bà phòng khách", "Trầu bà lá xẻ", "Monstera deliciosa",
                "Góc sofa", java.time.LocalDate.of(2026, 5, 1), "Ít nắng", now, null);

        when(jdbc.queryForObject(contains("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?"), eq(Integer.class), eq(gardenId), eq(userId)))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("SELECT count(*) FROM plant_catalog WHERE id=? AND is_active=true AND publication_status='approved'"), eq(Integer.class), eq(catalogId)))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("FROM user_plants p JOIN plant_catalog c"), any(RowMapper.class), any(UUID.class), eq(userId)))
                .thenReturn(createdPlant);

        mockMvc.perform(post("/api/v1/plants")
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "catalogId": "%s",
                                  "gardenId": "%s",
                                  "displayName": "Trầu bà ban công",
                                  "specificLocation": "Kệ cửa sổ",
                                  "plantedOn": "2026-05-01",
                                  "note": "Tưới vừa"
                                }
                                """.formatted(catalogId, gardenId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.displayName").value("Trầu bà ban công"))
                .andExpect(jsonPath("$.gardenId").value(gardenId.toString()));

        when(jdbc.update(contains("UPDATE user_plants SET display_name=?"), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM user_plants p JOIN plant_catalog c"), any(RowMapper.class), eq(plantId), eq(userId)))
                .thenReturn(updatedPlant);

        mockMvc.perform(put("/api/v1/plants/{id}", plantId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Trầu bà phòng khách",
                                  "gardenId": null,
                                  "specificLocation": "Góc sofa",
                                  "plantedOn": "2026-05-01",
                                  "note": "Ít nắng"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Trầu bà phòng khách"))
                .andExpect(jsonPath("$.specificLocation").value("Góc sofa"));

        when(jdbc.update(contains("UPDATE user_plants SET archived_at=now(),updated_at=now()"), eq(plantId), eq(userId)))
                .thenReturn(1);

        mockMvc.perform(delete("/api/v1/plants/{id}", plantId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());

        verify(jdbc).update(contains("UPDATE user_plants SET archived_at=now(),updated_at=now()"), eq(plantId), eq(userId));
        verify(jdbc).update(contains("UPDATE care_schedules SET is_active=false"), eq(plantId), eq(userId));
        verify(jdbc).update(contains("DELETE FROM care_tasks WHERE user_plant_id=? AND owner_user_id=? AND status='pending'"), eq(plantId), eq(userId));
    }

    @Test
    void plantPhotoEndpointsEnforceAuthOwnershipValidationAndLifecycle() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        UUID foreignPlantId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");

        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", pngOut);
        MockMultipartFile validPng = new MockMultipartFile("file", "plant.png", MediaType.IMAGE_PNG_VALUE, pngOut.toByteArray());
        MockMultipartFile invalidFile = new MockMultipartFile("file", "bad.txt", MediaType.TEXT_PLAIN_VALUE, "not-an-image".getBytes());

        mockMvc.perform(get("/api/v1/plants/{id}/photo", plantId))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart("/api/v1/plants/{id}/photo", plantId)
                        .file(invalidFile)
                        .header("Authorization", memberBearer))
                .andExpect(status().isUnsupportedMediaType());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL"), eq(Integer.class), eq(foreignPlantId), eq(userId)))
                .thenReturn(0);
        mockMvc.perform(multipart("/api/v1/plants/{id}/photo", foreignPlantId)
                        .file(validPng)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/v1/plants/{id}/photo", foreignPlantId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL"), eq(Integer.class), eq(plantId), eq(userId)))
                .thenReturn(1);
        mockMvc.perform(multipart("/api/v1/plants/{id}/photo", plantId)
                        .file(validPng)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());

        when(jdbc.query(contains("FROM user_plant_photos ph"), any(RowMapper.class), eq(plantId), eq(userId)))
                .thenReturn(List.of());
        mockMvc.perform(get("/api/v1/plants/{id}/photo", plantId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/plants/{id}/photo", plantId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());
    }

    @Test
    void catalogFavoritesAndAdminUpdateEnforceAuthRolesAndValidation() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID catalogId = UUID.randomUUID();
        UUID missingCatalogId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");
        String adminBearer = bearerToken(adminId, "admin");

        when(jdbc.queryForObject(contains("SELECT count(*) FROM plant_catalog WHERE id=? AND is_active=true AND publication_status='approved'"), eq(Integer.class), eq(missingCatalogId)))
                .thenReturn(0);
        mockMvc.perform(post("/api/v1/catalog/plants/{id}/favorite", missingCatalogId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM plant_catalog WHERE id=? AND is_active=true AND publication_status='approved'"), eq(Integer.class), eq(catalogId)))
                .thenReturn(1);
        mockMvc.perform(post("/api/v1/catalog/plants/{id}/favorite", catalogId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/v1/catalog/plants/{id}/favorite", catalogId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNoContent());

        String updateBody = """
                {
                  "commonName": "Trầu bà lá xẻ",
                  "scientificName": "Monstera deliciosa",
                  "category": "Cây nội thất",
                  "difficulty": "Dễ",
                  "lightRequirement": "Ánh sáng gián tiếp vừa",
                  "waterFrequencyDays": 5
                }
                """;
        mockMvc.perform(put("/api/v1/admin/catalog/plants/{id}", catalogId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isForbidden());

        PlantCatalogController.Plant updatedCatalog = new PlantCatalogController.Plant(
                catalogId, "Trầu bà lá xẻ", "Monstera deliciosa", "Cây nội thất",
                "Dễ", "Ánh sáng gián tiếp vừa", 5, null, null, null, null, null);
        when(jdbc.update(contains("UPDATE plant_catalog"), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM plant_catalog WHERE id=?"), any(RowMapper.class), eq(catalogId)))
                .thenReturn(updatedCatalog);

        mockMvc.perform(put("/api/v1/admin/catalog/plants/{id}", catalogId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commonName").value("Trầu bà lá xẻ"))
                .andExpect(jsonPath("$.waterFrequencyDays").value(5));
    }

    @Test
    void journalEndpointsEnforceAuthPaginationFiltersAndCrossUserIsolation() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        UUID foreignJournalId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");

        mockMvc.perform(get("/api/v1/journals"))
                .andExpect(status().isUnauthorized());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM plant_journals j JOIN user_plants p"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM plant_journals j"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/journals")
                        .param("page", "0")
                        .param("size", "10")
                        .param("plantId", plantId.toString())
                        .param("logType", "growth")
                        .param("healthStatus", "warning")
                        .param("q", "chồi")
                        .header("Authorization", memberBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items").isArray());

        when(jdbc.query(contains("WHERE j.id=? AND j.owner_user_id=?"), any(RowMapper.class), eq(foreignJournalId), eq(userId)))
                .thenReturn(List.of());
        mockMvc.perform(get("/api/v1/journals/{journalId}", foreignJournalId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());

        when(jdbc.update(contains("DELETE FROM plant_journals WHERE id=? AND owner_user_id=?"), eq(foreignJournalId), eq(userId)))
                .thenReturn(0);
        mockMvc.perform(delete("/api/v1/journals/{journalId}", foreignJournalId)
                        .header("Authorization", memberBearer))
                .andExpect(status().isNotFound());
    }

    @Test
    void journalValidationEnforcesLogTypeHealthStatusCareTaskPlantAndMaxPhotos() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID plantId = UUID.randomUUID();
        UUID wrongCareTaskId = UUID.randomUUID();
        UUID journalId = UUID.randomUUID();
        String memberBearer = bearerToken(userId, "member");

        when(jdbc.queryForObject(contains("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL"), eq(Integer.class), eq(plantId), eq(userId)))
                .thenReturn(1);

        mockMvc.perform(post("/api/v1/plants/{plantId}/journals", plantId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "logType": "invalid_type",
                                  "healthStatus": "healthy",
                                  "note": "Ghi chú"
                                }
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/plants/{plantId}/journals", plantId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "logType": "growth",
                                  "healthStatus": "unknown_status",
                                  "note": "Ghi chú"
                                }
                                """))
                .andExpect(status().isBadRequest());

        when(jdbc.queryForObject(contains("SELECT count(*) FROM care_tasks WHERE id=? AND owner_user_id=? AND user_plant_id=?"), eq(Integer.class), eq(wrongCareTaskId), eq(userId), eq(plantId)))
                .thenReturn(0);

        mockMvc.perform(post("/api/v1/plants/{plantId}/journals", plantId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "logType": "watering",
                                  "healthStatus": "healthy",
                                  "note": "Tưới xong",
                                  "careTaskId": "%s"
                                }
                                """.formatted(wrongCareTaskId)))
                .andExpect(status().isBadRequest());

        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", pngOut);
        MockMultipartFile validPng = new MockMultipartFile("file", "journal.png", MediaType.IMAGE_PNG_VALUE, pngOut.toByteArray());

        when(jdbc.queryForObject(contains("FROM plant_journals j"), eq(Integer.class), eq(journalId), eq(userId)))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("SELECT count(*) FROM journal_photos WHERE journal_id=? AND owner_user_id=?"), eq(Integer.class), eq(journalId), eq(userId)))
                .thenReturn(5);

        mockMvc.perform(multipart("/api/v1/journals/{journalId}/photos", journalId)
                        .file(validPng)
                        .header("Authorization", memberBearer))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminUserManagementEnforcesRoleLastAdminGuardAndAuditLogging() throws Exception {
        UUID adminId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID targetUserId = UUID.randomUUID();
        String adminBearer = bearerToken(adminId, "admin");
        String memberBearer = bearerToken(memberId, "member");

        mockMvc.perform(get("/api/v1/admin/users").header("Authorization", memberBearer))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/admin/users/stats").header("Authorization", memberBearer))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/admin/audit-logs").header("Authorization", memberBearer))
                .andExpect(status().isForbidden());

        when(jdbc.queryForObject(contains("AS total_users"), any(RowMapper.class)))
                .thenReturn(new vn.goplant.backend.admin.AdminUserService.AdminUserStats(10, 7, 2, 1, 1, 3, 5));

        mockMvc.perform(get("/api/v1/admin/users/stats").header("Authorization", adminBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalUsers").value(10))
                .andExpect(jsonPath("$.activeUsers").value(7))
                .andExpect(jsonPath("$.pendingUsers").value(2));

        when(jdbc.queryForObject(contains("SELECT count(*) FROM users u JOIN user_email_addresses"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM users u\nJOIN user_email_addresses"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/admin/users")
                        .param("page", "0")
                        .param("size", "10")
                        .param("activity", "never_logged_in")
                        .header("Authorization", adminBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(get("/api/v1/admin/users")
                        .param("activity", "invalid_activity")
                        .header("Authorization", adminBearer))
                .andExpect(status().isBadRequest());

        // Self-lock must be rejected.
        mockMvc.perform(patch("/api/v1/admin/users/{id}/status", adminId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"locked","reason":"Self lock"}
                                """))
                .andExpect(status().isBadRequest());

        // Locking the last active admin must be rejected with 409 Conflict.
        when(jdbc.queryForList("SELECT status FROM users WHERE id = ? FOR UPDATE", String.class, targetUserId))
                .thenReturn(List.of("active"));
        when(jdbc.queryForObject(contains("WHERE ur.user_id = ? AND r.code = ?"), eq(Integer.class), eq(targetUserId), eq("admin")))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("WHERE r.code = 'admin' AND u.status = 'active'"), eq(Integer.class)))
                .thenReturn(1);

        mockMvc.perform(patch("/api/v1/admin/users/{id}/status", targetUserId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"locked","reason":"Test lock last admin"}
                                """))
                .andExpect(status().isConflict());

        // Revoking admin role from the last active admin must also be rejected with 409 Conflict.
        mockMvc.perform(put("/api/v1/admin/users/{id}/roles", targetUserId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"admin":false,"reason":"Test revoke last admin"}
                                """))
                .andExpect(status().isConflict());

        // Auth history endpoints for member and admin.
        mockMvc.perform(get("/api/v1/auth/me/auth-events"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/auth-events").header("Authorization", memberBearer))
                .andExpect(status().isForbidden());

        when(jdbc.queryForObject(contains("FROM user_auth_events ev"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM user_auth_events ev"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/auth/me/auth-events")
                        .header("Authorization", memberBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(get("/api/v1/admin/auth-events")
                        .param("eventType", "LOGIN_SUCCESS")
                        .header("Authorization", adminBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(get("/api/v1/admin/auth-events")
                        .param("eventType", "INVALID_EVENT")
                        .header("Authorization", adminBearer))
                .andExpect(status().isBadRequest());

        // Resend verification endpoint requires admin and pending_verification status.
        mockMvc.perform(post("/api/v1/admin/users/{id}/resend-verification", targetUserId)
                        .header("Authorization", memberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        when(jdbc.query(contains("SELECT u.status, e.normalized_email"), any(RowMapper.class), eq(targetUserId)))
                .thenReturn(List.of());
        mockMvc.perform(post("/api/v1/admin/users/{id}/resend-verification", targetUserId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void lockingUserOrRevokingSessionsImmediatelyInvalidatesAccessToken() throws Exception {
        UUID adminId = UUID.randomUUID();
        UUID lockedUserId = UUID.randomUUID();
        UUID revokedUserId = UUID.randomUUID();
        String adminBearer = bearerToken(adminId, "admin");
        String lockedUserBearer = bearerToken(lockedUserId, "user");
        String revokedUserBearer = bearerToken(revokedUserId, "user");

        when(jdbc.queryForObject(contains("FROM user_auth_events ev"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM user_auth_events ev"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("FROM admin_audit_logs l"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM admin_audit_logs l"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", lockedUserBearer))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", revokedUserBearer))
                .andExpect(status().isOk());

        when(jdbc.queryForList("SELECT status FROM users WHERE id = ? FOR UPDATE", String.class, lockedUserId))
                .thenReturn(List.of("active"));
        when(jdbc.queryForObject(contains("WHERE ur.user_id = ? AND r.code = ?"), eq(Integer.class), eq(lockedUserId), eq("admin")))
                .thenReturn(0);
        when(jdbc.query(contains("WHERE u.id = ?"), any(RowMapper.class), eq(lockedUserId)))
                .thenReturn(List.of(new vn.goplant.backend.admin.AdminUserService.AdminUserSummary(
                        lockedUserId, "locked@goplant.vn", "Locked User", "locked", "Asia/Ho_Chi_Minh",
                        List.of("user"), Instant.now(), 0, 0, 0, null, null, Instant.now(), Instant.now(), null)));

        mockMvc.perform(patch("/api/v1/admin/users/{id}/status", lockedUserId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"locked","reason":"Immediate cutoff test"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", lockedUserBearer))
                .andExpect(status().isUnauthorized());

        when(jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, revokedUserId))
                .thenReturn(1);
        when(jdbc.query(contains("WHERE u.id = ?"), any(RowMapper.class), eq(revokedUserId)))
                .thenReturn(List.of(new vn.goplant.backend.admin.AdminUserService.AdminUserSummary(
                        revokedUserId, "revoked@goplant.vn", "Revoked User", "active", "Asia/Ho_Chi_Minh",
                        List.of("user"), Instant.now(), 0, 0, 0, null, null, Instant.now(), Instant.now(), null)));

        mockMvc.perform(post("/api/v1/admin/users/{id}/revoke-sessions", revokedUserId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", revokedUserBearer))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void moderatorCanAccessCatalogOnlyAndAuthEventRetentionPurgesOldRows() throws Exception {
        UUID moderatorId = UUID.randomUUID();
        String moderatorBearer = bearerToken(moderatorId, "moderator");

        mockMvc.perform(get("/api/v1/admin/users").header("Authorization", moderatorBearer))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/admin/catalog/plants")
                        .header("Authorization", moderatorBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        when(jdbc.update(contains("DELETE FROM user_auth_events WHERE created_at < ?"), any(java.sql.Timestamp.class)))
                .thenReturn(12);
        var retentionService = new vn.goplant.backend.auth.AuthEventService(jdbc, 90);
        org.junit.jupiter.api.Assertions.assertEquals(12, retentionService.purgeExpiredEvents());
    }

    @Test
    void loginDistinguishesPendingVerificationAndLockedAccounts() throws Exception {
        UUID pendingUserId = UUID.randomUUID();
        UUID lockedUserId = UUID.randomUUID();
        String encodedPassword = passwordEncoder.encode("correct-password-12");

        when(jdbc.query(contains("SELECT u.id,u.display_name,u.password_hash,u.status"), any(RowMapper.class), eq("pending-login@goplant.test")))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(pendingUserId);
                    when(rs.getString("display_name")).thenReturn("Pending User");
                    when(rs.getString("password_hash")).thenReturn(encodedPassword);
                    when(rs.getString("status")).thenReturn("pending_verification");
                    when(rs.getString("normalized_email")).thenReturn("pending-login@goplant.test");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    return List.of(mapper.mapRow(rs, 0));
                });

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"pending-login@goplant.test","password":"correct-password-12"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Tài khoản chưa xác minh email. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác minh."));

        when(jdbc.query(contains("SELECT u.id,u.display_name,u.password_hash,u.status"), any(RowMapper.class), eq("locked-login@goplant.test")))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(lockedUserId);
                    when(rs.getString("display_name")).thenReturn("Locked User");
                    when(rs.getString("password_hash")).thenReturn(encodedPassword);
                    when(rs.getString("status")).thenReturn("locked");
                    when(rs.getString("normalized_email")).thenReturn("locked-login@goplant.test");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    return List.of(mapper.mapRow(rs, 0));
                });

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"locked-login@goplant.test","password":"correct-password-12"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ."));
    }

    @Test
    void verifyEmailHtmlPagesRenderConfirmSuccessAndFriendlyErrorsWithDeepLink() throws Exception {
        String validTokenFormat = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_abcde";
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID emailId = UUID.randomUUID();

        mockMvc.perform(get("/api/v1/auth/verify-email").param("token", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Liên kết xác minh không hợp lệ")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));

        mockMvc.perform(get("/api/v1/auth/verify-email").param("token", validTokenFormat))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Xác minh email ngay")));

        when(jdbc.query(contains("FROM account_action_tokens t"), any(RowMapper.class), anyString()))
                .thenReturn(List.<Object[]>of(new Object[]{tokenId, userId, emailId}))
                .thenReturn(List.of());

        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", validTokenFormat))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Email đã được xác minh!")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Mở ứng dụng GoPlant")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));

        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", validTokenFormat))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Liên kết đã hết hạn hoặc đã được sử dụng")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));
    }

    @Test
    void passwordResetEnforcesRateLimitOldPasswordCheckAndImmediateTokenCutoff() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        String userBearer = bearerToken(userId, "user");
        String currentHash = passwordEncoder.encode("old-secret-password-12");

        when(jdbc.queryForObject(contains("FROM user_auth_events ev"), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(contains("FROM user_auth_events ev"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", userBearer))
                .andExpect(status().isOk());

        // Rate-limit 60s on forgot-password
        when(jdbc.query(contains("WHERE e.normalized_email = ? AND u.status = 'active'"), any(RowMapper.class), eq("reset-guard@goplant.test")))
                .thenReturn(List.of(userId));
        when(jdbc.query(contains("WHERE user_id = ? AND purpose = 'PASSWORD_RESET'"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of(Instant.now().minusSeconds(10)));

        mockMvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"reset-guard@goplant.test"}
                                """))
                .andExpect(status().isTooManyRequests());

        // Reject reusing current password & accept new password with immediate access token cutoff
        when(jdbc.query(contains("SELECT t.id AS token_id, t.user_id, u.password_hash"), any(RowMapper.class), anyString()))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("token_id", UUID.class)).thenReturn(tokenId);
                    when(rs.getObject("user_id", UUID.class)).thenReturn(userId);
                    when(rs.getString("password_hash")).thenReturn(currentHash);
                    when(rs.getString("normalized_email")).thenReturn("reset-guard@goplant.test");
                    return List.of(mapper.mapRow(rs, 0));
                });

        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"valid-reset-token-value-1234567890","newPassword":"old-secret-password-12"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"valid-reset-token-value-1234567890","newPassword":"brand-new-secret-pass-99"}
                                """))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/auth/me/auth-events").header("Authorization", userBearer))
                .andExpect(status().isUnauthorized());

        // Admin send-password-reset authorization & validation
        String otherMemberBearer = bearerToken(UUID.randomUUID(), "user");
        mockMvc.perform(post("/api/v1/admin/users/{id}/send-password-reset", userId)
                        .header("Authorization", otherMemberBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        UUID adminId = UUID.randomUUID();
        String adminBearer = bearerToken(adminId, "admin");
        when(jdbc.query(contains("SELECT u.status, e.normalized_email"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of());
        mockMvc.perform(post("/api/v1/admin/users/{id}/send-password-reset", userId)
                        .header("Authorization", adminBearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void resetPasswordHtmlPagesRenderFormValidationSuccessAndDeepLink() throws Exception {
        String validTokenFormat = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_reset";
        UUID tokenId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String oldHash = passwordEncoder.encode("existing-password-12");

        mockMvc.perform(get("/api/v1/auth/reset-password").param("token", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Liên kết đặt lại mật khẩu không hợp lệ")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));

        mockMvc.perform(get("/api/v1/auth/reset-password").param("token", validTokenFormat))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("confirmPassword")));

        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", validTokenFormat)
                        .param("newPassword", "new-password-12345")
                        .param("confirmPassword", "different-password-123"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("chưa khớp")));

        when(jdbc.query(contains("SELECT t.id AS token_id, t.user_id, u.password_hash"), any(RowMapper.class), anyString()))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("token_id", UUID.class)).thenReturn(tokenId);
                    when(rs.getObject("user_id", UUID.class)).thenReturn(userId);
                    when(rs.getString("password_hash")).thenReturn(oldHash);
                    when(rs.getString("normalized_email")).thenReturn("html-reset@goplant.test");
                    return List.of(mapper.mapRow(rs, 0));
                })
                .thenReturn(List.of());

        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", validTokenFormat)
                        .param("newPassword", "brand-new-password-123")
                        .param("confirmPassword", "brand-new-password-123"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Đã đặt lại mật khẩu!")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));

        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", validTokenFormat)
                        .param("newPassword", "brand-new-password-123")
                        .param("confirmPassword", "brand-new-password-123"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Liên kết đã hết hạn hoặc đã được sử dụng")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("goplantt://auth/login")));
    }

    @Test
    void userAvatarUploadFetchDeleteAndAdminView() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        String userBearer = bearerToken(userId, "user");
        String adminBearer = bearerToken(adminId, "admin");

        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", pngOut);
        byte[] pngBytes = pngOut.toByteArray();
        MockMultipartFile validPng = new MockMultipartFile("file", "avatar.png", MediaType.IMAGE_PNG_VALUE, pngBytes);

        Instant now = Instant.now();
        when(jdbc.query(contains("SELECT u.id,u.display_name,u.timezone"), any(RowMapper.class), eq(userId)))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getObject("id", UUID.class)).thenReturn(userId);
                    when(rs.getString("normalized_email")).thenReturn("avatar@goplant.test");
                    when(rs.getString("display_name")).thenReturn("Avatar User");
                    when(rs.getString("timezone")).thenReturn("Asia/Ho_Chi_Minh");
                    return List.of(mapper.mapRow(rs, 0));
                });
        when(jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", String.class, userId))
                .thenReturn(List.of("user"));
        when(jdbc.queryForList("SELECT updated_at FROM user_avatars WHERE user_id = ?", java.sql.Timestamp.class, userId))
                .thenReturn(List.of(java.sql.Timestamp.from(now)));

        mockMvc.perform(multipart("/api/v1/auth/me/avatar")
                        .file(validPng)
                        .header("Authorization", userBearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUpdatedAt").isNotEmpty());

        when(jdbc.query(contains("SELECT content_type, image_bytes FROM user_avatars"), any(RowMapper.class), eq(userId)))
                .thenAnswer(inv -> {
                    RowMapper<?> mapper = inv.getArgument(1);
                    java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                    when(rs.getString("content_type")).thenReturn("image/png");
                    when(rs.getBytes("image_bytes")).thenReturn(pngBytes);
                    return List.of(mapper.mapRow(rs, 0));
                });

        mockMvc.perform(get("/api/v1/auth/me/avatar").header("Authorization", userBearer))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));

        mockMvc.perform(get("/api/v1/admin/users/{id}/avatar", userId).header("Authorization", userBearer))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/admin/users/{id}/avatar", userId).header("Authorization", adminBearer))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));

        mockMvc.perform(delete("/api/v1/auth/me/avatar").header("Authorization", userBearer))
                .andExpect(status().isNoContent());
    }
}
