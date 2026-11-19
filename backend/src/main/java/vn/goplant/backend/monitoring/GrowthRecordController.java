package vn.goplant.backend.monitoring;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class GrowthRecordController {
    private static final RowMapper<GrowthRecord> RECORD_MAPPER = (rs, row) -> new GrowthRecord(
            rs.getObject("id", UUID.class),
            rs.getObject("user_plant_id", UUID.class),
            rs.getObject("recorded_date", LocalDate.class),
            rs.getBigDecimal("height_cm"),
            rs.getObject("leaf_count", Integer.class),
            rs.getString("bloom_stage"),
            rs.getString("note"),
            rs.getTimestamp("created_at").toInstant());

    private final JdbcTemplate jdbc;

    public GrowthRecordController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/plants/{plantId}/growth-records")
    public List<GrowthRecord> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID plantId) {
        UUID owner = UUID.fromString(jwt.getSubject());
        ensurePlantOwned(owner, plantId);
        return jdbc.query("""
                SELECT id,user_plant_id,recorded_date,height_cm,leaf_count,bloom_stage,note,created_at
                FROM plant_growth_records
                WHERE user_plant_id=? AND owner_user_id=?
                ORDER BY recorded_date ASC, created_at ASC
                """, RECORD_MAPPER, plantId, owner);
    }

    @PostMapping("/plants/{plantId}/growth-records")
    @ResponseStatus(HttpStatus.CREATED)
    public GrowthRecord create(@AuthenticationPrincipal Jwt jwt,
                               @PathVariable UUID plantId,
                               @Valid @RequestBody GrowthRecordRequest request) {
        UUID owner = UUID.fromString(jwt.getSubject());
        ensurePlantOwned(owner, plantId);
        String bloomStage = blankToNull(request.bloomStage());
        if (request.heightCm() == null && request.leafCount() == null && bloomStage == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Vui lòng nhập ít nhất một chỉ số (chiều cao, số lá hoặc giai đoạn sinh trưởng).");
        }
        LocalDate recordedDate = request.recordedDate() != null ? request.recordedDate() : LocalDate.now();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO plant_growth_records(id,user_plant_id,owner_user_id,recorded_date,height_cm,leaf_count,bloom_stage,note)
                VALUES (?,?,?,?,?,?,?,?)
                """, id, plantId, owner, Date.valueOf(recordedDate), request.heightCm(), request.leafCount(), bloomStage,
                blankToNull(request.note()));
        return jdbc.queryForObject("""
                SELECT id,user_plant_id,recorded_date,height_cm,leaf_count,bloom_stage,note,created_at
                FROM plant_growth_records WHERE id=?
                """, RECORD_MAPPER, id);
    }

    @DeleteMapping("/growth-records/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        UUID owner = UUID.fromString(jwt.getSubject());
        int changed = jdbc.update("DELETE FROM plant_growth_records WHERE id=? AND owner_user_id=?", id, owner);
        if (changed == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    private void ensurePlantOwned(UUID owner, UUID plantId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, plantId, owner);
        if (count == null || count == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Plant not found");
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record GrowthRecordRequest(
            LocalDate recordedDate,
            @DecimalMin("0") @DecimalMax("9999.9") BigDecimal heightCm,
            @Min(0) @Max(100000) Integer leafCount,
            @Pattern(regexp = "seedling|budding|flowering|fruiting") String bloomStage,
            @Size(max = 1000) String note) {}

    public record GrowthRecord(
            UUID id,
            UUID plantId,
            LocalDate recordedDate,
            BigDecimal heightCm,
            Integer leafCount,
            String bloomStage,
            String note,
            Instant createdAt) {}
}
