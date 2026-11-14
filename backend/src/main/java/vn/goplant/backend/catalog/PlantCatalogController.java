package vn.goplant.backend.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import vn.goplant.backend.config.PageResponse;

@RestController
public class PlantCatalogController {
    private final JdbcTemplate jdbc;
    public PlantCatalogController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final String PLANT_COLUMNS = """
            id,common_name,scientific_name,category,difficulty,light_requirement,
            water_frequency_days,temperature_range,toxicity_warning,overview,origin,morphology
            """;

    private static final RowMapper<Plant> PLANT_MAPPER = (rs, row) -> new Plant(
            rs.getObject("id", UUID.class),
            rs.getString("common_name"),
            rs.getString("scientific_name"),
            rs.getString("category"),
            rs.getString("difficulty"),
            rs.getString("light_requirement"),
            rs.getObject("water_frequency_days", Integer.class),
            rs.getString("temperature_range"),
            rs.getString("toxicity_warning"),
            rs.getString("overview"),
            rs.getString("origin"),
            rs.getString("morphology"));

    @GetMapping("/api/v1/catalog/plants")
    public PageResponse<Plant> listPublished(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category) {
        int safePage = PageResponse.normalizePage(page);
        int safeSize = PageResponse.normalizeSize(size);
        StringBuilder where = new StringBuilder(" WHERE is_active=true AND publication_status='approved'");
        List<Object> params = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.trim().toLowerCase() + "%";
            where.append(" AND (LOWER(common_name) LIKE ? OR LOWER(scientific_name) LIKE ?)");
            params.add(pattern);
            params.add(pattern);
        }
        if (category != null && !category.isBlank()) {
            where.append(" AND LOWER(category) = ?");
            params.add(category.trim().toLowerCase());
        }
        Long total = jdbc.queryForObject("SELECT count(*) FROM plant_catalog" + where, Long.class, params.toArray());
        long totalElements = total == null ? 0L : total;

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(safeSize);
        queryParams.add((long) safePage * safeSize);
        List<Plant> items = jdbc.query(
                "SELECT " + PLANT_COLUMNS + " FROM plant_catalog" + where + " ORDER BY common_name LIMIT ? OFFSET ?",
                PLANT_MAPPER,
                queryParams.toArray());
        return PageResponse.of(items, safePage, safeSize, totalElements);
    }

    @GetMapping("/api/v1/favorites")
    public List<Plant> listFavorites(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.query("""
                SELECT c.id,c.common_name,c.scientific_name,c.category,c.difficulty,c.light_requirement,
                       c.water_frequency_days,c.temperature_range,c.toxicity_warning,c.overview,c.origin,c.morphology
                FROM user_plant_favorites f
                JOIN plant_catalog c ON c.id=f.plant_catalog_id
                WHERE f.user_id=? AND c.is_active=true AND c.publication_status='approved' ORDER BY c.common_name
                """, PLANT_MAPPER, UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/api/v1/catalog/plants/{id}/favorite")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void addFavorite(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        int allowed = jdbc.queryForObject("SELECT count(*) FROM plant_catalog WHERE id=? AND is_active=true AND publication_status='approved'", Integer.class, id);
        if (allowed == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
        jdbc.update("INSERT INTO user_plant_favorites(user_id,plant_catalog_id) VALUES (?,?) ON CONFLICT DO NOTHING", UUID.fromString(jwt.getSubject()), id);
    }

    @DeleteMapping("/api/v1/catalog/plants/{id}/favorite")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void removeFavorite(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        jdbc.update("DELETE FROM user_plant_favorites WHERE user_id=? AND plant_catalog_id=?", UUID.fromString(jwt.getSubject()), id);
    }

    @PostMapping("/api/v1/admin/catalog/plants")
    @Transactional
    public Plant create(@Valid @RequestBody PlantRequest request, @AuthenticationPrincipal Jwt jwt) {
        if ((request.sourceTitle() == null || request.sourceTitle().isBlank()) && (request.sourceUrl() == null || request.sourceUrl().isBlank())) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "sourceTitle or sourceUrl is required");
        }
        UUID id = UUID.randomUUID();
        UUID adminId = UUID.fromString(jwt.getSubject());
        try {
            jdbc.update("""
                    INSERT INTO plant_catalog(
                        id,common_name,scientific_name,category,difficulty,light_requirement,
                        water_frequency_days,temperature_range,toxicity_warning,overview,origin,morphology,
                        publication_status,reviewed_by,reviewed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,now())
                    """, id, request.commonName().trim(), request.scientificName().trim(), request.category().trim(),
                    blankToNull(request.difficulty()), blankToNull(request.lightRequirement()),
                    request.waterFrequencyDays(), blankToNull(request.temperatureRange()),
                    blankToNull(request.toxicityWarning()), blankToNull(request.overview()),
                    blankToNull(request.origin()), blankToNull(request.morphology()), adminId);
        } catch (DuplicateKeyException exception) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "A plant with this scientific name already exists");
        }
        jdbc.update("INSERT INTO plant_catalog_sources(plant_catalog_id,source_title,source_url,supports_fields,added_by) VALUES (?,?,?,?::text[],?)",
                id, blankToNull(request.sourceTitle()), blankToNull(request.sourceUrl()), "{common_name,scientific_name,category}", adminId);
        return jdbc.queryForObject("SELECT " + PLANT_COLUMNS + " FROM plant_catalog WHERE id=?", PLANT_MAPPER, id);
    }

    @PutMapping("/api/v1/admin/catalog/plants/{id}")
    @Transactional
    public Plant update(@PathVariable UUID id, @Valid @RequestBody PlantRequest request, @AuthenticationPrincipal Jwt jwt) {
        UUID adminId = UUID.fromString(jwt.getSubject());
        try {
            int updated = jdbc.update("""
                    UPDATE plant_catalog
                    SET common_name=?, scientific_name=?, category=?, difficulty=?, light_requirement=?,
                        water_frequency_days=?, temperature_range=?, toxicity_warning=?, overview=?, origin=?, morphology=?,
                        reviewed_by=?, reviewed_at=now(), updated_at=now()
                    WHERE id=? AND is_active=true
                    """,
                    request.commonName().trim(), request.scientificName().trim(), request.category().trim(),
                    blankToNull(request.difficulty()), blankToNull(request.lightRequirement()),
                    request.waterFrequencyDays(), blankToNull(request.temperatureRange()),
                    blankToNull(request.toxicityWarning()), blankToNull(request.overview()),
                    blankToNull(request.origin()), blankToNull(request.morphology()), adminId, id);
            if (updated == 0) {
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
            }
        } catch (DuplicateKeyException exception) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "A plant with this scientific name already exists");
        }
        return jdbc.queryForObject("SELECT " + PLANT_COLUMNS + " FROM plant_catalog WHERE id=?", PLANT_MAPPER, id);
    }

    @PostMapping("/api/v1/admin/catalog/plants/{id}/approve")
    @Transactional
    public Plant approve(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        int count = jdbc.update("UPDATE plant_catalog SET publication_status='approved',reviewed_by=?,reviewed_at=now(),updated_at=now() WHERE id=? AND is_active=true",
                UUID.fromString(jwt.getSubject()), id);
        if (count == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
        return jdbc.queryForObject("SELECT " + PLANT_COLUMNS + " FROM plant_catalog WHERE id=?", PLANT_MAPPER, id);
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public record PlantRequest(
            @NotBlank @Size(max=200) String commonName,
            @NotBlank @Size(max=240) String scientificName,
            @NotBlank @Size(max=80) String category,
            @Size(max=240) String sourceTitle,
            @Size(max=2000) String sourceUrl,
            @Size(max=60) String difficulty,
            @Size(max=200) String lightRequirement,
            @Min(1) @Max(365) Integer waterFrequencyDays,
            @Size(max=80) String temperatureRange,
            @Size(max=2000) String toxicityWarning,
            @Size(max=4000) String overview,
            @Size(max=240) String origin,
            @Size(max=4000) String morphology) {}

    public record Plant(
            UUID id,
            String commonName,
            String scientificName,
            String category,
            String difficulty,
            String lightRequirement,
            Integer waterFrequencyDays,
            String temperatureRange,
            String toxicityWarning,
            String overview,
            String origin,
            String morphology) {}
}
