package vn.goplant.backend.catalog;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PlantCatalogController {
    private final JdbcTemplate jdbc;
    public PlantCatalogController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/api/v1/catalog/plants")
    public List<Plant> listPublished() {
        return jdbc.query("SELECT id,common_name,scientific_name,category FROM plant_catalog WHERE is_active=true AND publication_status='approved' ORDER BY common_name",
                (rs, row) -> new Plant(rs.getObject("id", UUID.class), rs.getString("common_name"), rs.getString("scientific_name"), rs.getString("category")));
    }

    @GetMapping("/api/v1/favorites")
    public List<Plant> listFavorites(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.query("""
                SELECT c.id,c.common_name,c.scientific_name,c.category FROM user_plant_favorites f
                JOIN plant_catalog c ON c.id=f.plant_catalog_id
                WHERE f.user_id=? AND c.is_active=true AND c.publication_status='approved' ORDER BY c.common_name
                """, (rs, row) -> new Plant(rs.getObject("id", UUID.class), rs.getString("common_name"), rs.getString("scientific_name"), rs.getString("category")), UUID.fromString(jwt.getSubject()));
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
                    INSERT INTO plant_catalog(id,common_name,scientific_name,category,publication_status,reviewed_by,reviewed_at)
                    VALUES (?,?,?,?,'approved',?,now())
                    """, id, request.commonName().trim(), request.scientificName().trim(), request.category().trim(), adminId);
        } catch (DuplicateKeyException exception) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "A plant with this scientific name already exists");
        }
        jdbc.update("INSERT INTO plant_catalog_sources(plant_catalog_id,source_title,source_url,supports_fields,added_by) VALUES (?,?,?,?::text[],?)",
                id, blankToNull(request.sourceTitle()), blankToNull(request.sourceUrl()), "{common_name,scientific_name,category}", adminId);
        return new Plant(id, request.commonName().trim(), request.scientificName().trim(), request.category().trim());
    }

    @PostMapping("/api/v1/admin/catalog/plants/{id}/approve")
    @Transactional
    public Plant approve(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        int count = jdbc.update("UPDATE plant_catalog SET publication_status='approved',reviewed_by=?,reviewed_at=now(),updated_at=now() WHERE id=? AND is_active=true",
                UUID.fromString(jwt.getSubject()), id);
        if (count == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
        return jdbc.queryForObject("SELECT id,common_name,scientific_name,category FROM plant_catalog WHERE id=?",
                (rs, row) -> new Plant(rs.getObject("id", UUID.class), rs.getString("common_name"), rs.getString("scientific_name"), rs.getString("category")), id);
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public record PlantRequest(@NotBlank @Size(max=200) String commonName, @NotBlank @Size(max=240) String scientificName,
                               @NotBlank @Size(max=80) String category, @Size(max=240) String sourceTitle, @Size(max=2000) String sourceUrl) {}
    public record Plant(UUID id, String commonName, String scientificName, String category) {}
}
