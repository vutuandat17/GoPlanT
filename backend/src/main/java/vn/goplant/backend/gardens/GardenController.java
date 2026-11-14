package vn.goplant.backend.gardens;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import vn.goplant.backend.care.CareScheduleService;
import vn.goplant.backend.config.PageResponse;

@RestController
@RequestMapping("/api/v1")
public class GardenController {
    private final JdbcTemplate jdbc;
    private final CareScheduleService care;
    public GardenController(JdbcTemplate jdbc, CareScheduleService care) { this.jdbc = jdbc; this.care = care; }

    @GetMapping("/gardens")
    public List<Garden> gardens(@AuthenticationPrincipal Jwt jwt) {
        UUID owner = owner(jwt);
        return jdbc.query("SELECT id,name,location_type,location_detail,description,created_at,updated_at FROM gardens WHERE owner_user_id=? ORDER BY created_at DESC",
                (rs, row) -> new Garden(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("location_type"), rs.getString("location_detail"), rs.getString("description"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), owner);
    }

    @PostMapping("/gardens")
    @ResponseStatus(HttpStatus.CREATED)
    public Garden createGarden(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GardenRequest request) {
        UUID id = UUID.randomUUID(); UUID owner = owner(jwt);
        jdbc.update("INSERT INTO gardens(id,owner_user_id,name,location_type,location_detail,description) VALUES (?,?,?,?,?,?)",
                id, owner, request.name().trim(), request.locationType(), blankToNull(request.locationDetail()), blankToNull(request.description()));
        return jdbc.queryForObject("SELECT id,name,location_type,location_detail,description,created_at,updated_at FROM gardens WHERE id=?",
                (rs, row) -> new Garden(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("location_type"), rs.getString("location_detail"), rs.getString("description"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), id);
    }

    @DeleteMapping("/gardens/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteGarden(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        UUID owner = owner(jwt);
        int exists = jdbc.queryForObject("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?", Integer.class, id, owner);
        if (exists == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        jdbc.update("UPDATE user_plants SET garden_id=NULL,updated_at=now() WHERE garden_id=? AND owner_user_id=?", id, owner);
        int changed = jdbc.update("DELETE FROM gardens WHERE id=? AND owner_user_id=?", id, owner);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    @GetMapping("/plants")
    public PageResponse<OwnedPlant> plants(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID gardenId) {
        int safePage = PageResponse.normalizePage(page);
        int safeSize = PageResponse.normalizeSize(size);
        StringBuilder where = new StringBuilder(" WHERE p.owner_user_id=? AND p.archived_at IS NULL");
        List<Object> params = new ArrayList<>();
        params.add(owner(jwt));
        if (gardenId != null) {
            where.append(" AND p.garden_id=?");
            params.add(gardenId);
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.trim().toLowerCase() + "%";
            where.append(" AND (LOWER(p.display_name) LIKE ? OR LOWER(c.common_name) LIKE ? OR LOWER(c.scientific_name) LIKE ?)");
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
        }
        Long total = jdbc.queryForObject(
                "SELECT count(*) FROM user_plants p JOIN plant_catalog c ON c.id=p.plant_catalog_id" + where,
                Long.class,
                params.toArray());
        long totalElements = total == null ? 0L : total;

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(safeSize);
        queryParams.add((long) safePage * safeSize);
        List<OwnedPlant> items = jdbc.query("""
                SELECT p.id,p.plant_catalog_id,p.garden_id,p.display_name,p.specific_location,p.planted_on,p.note,p.added_at,
                       c.common_name,c.scientific_name,ph.updated_at AS photo_updated_at
                FROM user_plants p JOIN plant_catalog c ON c.id=p.plant_catalog_id
                LEFT JOIN user_plant_photos ph ON ph.user_plant_id=p.id
                """ + where + " ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
                (rs, row) -> new OwnedPlant(rs.getObject("id", UUID.class), rs.getObject("plant_catalog_id", UUID.class),
                        rs.getObject("garden_id", UUID.class), rs.getString("display_name"), rs.getString("common_name"), rs.getString("scientific_name"),
                        rs.getString("specific_location"), rs.getObject("planted_on", java.time.LocalDate.class), rs.getString("note"), rs.getTimestamp("added_at").toInstant(),
                        rs.getTimestamp("photo_updated_at") == null ? null : rs.getTimestamp("photo_updated_at").toInstant()),
                queryParams.toArray());
        return PageResponse.of(items, safePage, safeSize, totalElements);
    }

    @PostMapping("/plants")
    @ResponseStatus(HttpStatus.CREATED)
    public OwnedPlant addPlant(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody OwnedPlantRequest request) {
        UUID owner = owner(jwt); UUID id = UUID.randomUUID();
        if (request.gardenId() != null && jdbc.queryForObject("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?", Integer.class, request.gardenId(), owner) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Garden not found");
        }
        if (jdbc.queryForObject("SELECT count(*) FROM plant_catalog WHERE id=? AND is_active=true AND publication_status='approved'", Integer.class, request.catalogId()) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Plant catalog entry not found");
        }
        jdbc.update("""
                INSERT INTO user_plants(id,owner_user_id,garden_id,plant_catalog_id,display_name,specific_location,planted_on,note)
                VALUES (?,?,?,?,?,?,?,?)
                """, id, owner, request.gardenId(), request.catalogId(), request.displayName().trim(), blankToNull(request.specificLocation()), request.plantedOn(), blankToNull(request.note()));
        return jdbc.queryForObject("""
                SELECT p.id,p.plant_catalog_id,p.garden_id,p.display_name,p.specific_location,p.planted_on,p.note,p.added_at,c.common_name,c.scientific_name,ph.updated_at AS photo_updated_at
                FROM user_plants p JOIN plant_catalog c ON c.id=p.plant_catalog_id
                LEFT JOIN user_plant_photos ph ON ph.user_plant_id=p.id WHERE p.id=? AND p.owner_user_id=?
                """, (rs, row) -> new OwnedPlant(rs.getObject("id", UUID.class), rs.getObject("plant_catalog_id", UUID.class), rs.getObject("garden_id", UUID.class),
                rs.getString("display_name"), rs.getString("common_name"), rs.getString("scientific_name"), rs.getString("specific_location"),
                rs.getObject("planted_on", java.time.LocalDate.class), rs.getString("note"), rs.getTimestamp("added_at").toInstant(),
                rs.getTimestamp("photo_updated_at") == null ? null : rs.getTimestamp("photo_updated_at").toInstant()), id, owner);
    }

    @DeleteMapping("/plants/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void removePlant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        int changed = jdbc.update("UPDATE user_plants SET archived_at=now(),updated_at=now() WHERE id=? AND owner_user_id=? AND archived_at IS NULL", id, owner(jwt));
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        care.deactivateForPlant(owner(jwt), id);
    }

    @PutMapping("/plants/{id}")
    public OwnedPlant updatePlant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody OwnedPlantUpdate request) {
        UUID owner = owner(jwt);
        if (request.gardenId() != null && jdbc.queryForObject("SELECT count(*) FROM gardens WHERE id=? AND owner_user_id=?", Integer.class, request.gardenId(), owner) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Garden not found");
        }
        int changed = jdbc.update("""
                UPDATE user_plants SET display_name=?,garden_id=?,specific_location=?,planted_on=?,note=?,updated_at=now()
                WHERE id=? AND owner_user_id=? AND archived_at IS NULL
                """, request.displayName().trim(), request.gardenId(), blankToNull(request.specificLocation()), request.plantedOn(), blankToNull(request.note()), id, owner);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return jdbc.queryForObject("""
                SELECT p.id,p.plant_catalog_id,p.garden_id,p.display_name,p.specific_location,p.planted_on,p.note,p.added_at,c.common_name,c.scientific_name,ph.updated_at AS photo_updated_at
                FROM user_plants p JOIN plant_catalog c ON c.id=p.plant_catalog_id
                LEFT JOIN user_plant_photos ph ON ph.user_plant_id=p.id WHERE p.id=? AND p.owner_user_id=?
                """, (rs, row) -> new OwnedPlant(rs.getObject("id", UUID.class), rs.getObject("plant_catalog_id", UUID.class), rs.getObject("garden_id", UUID.class),
                rs.getString("display_name"), rs.getString("common_name"), rs.getString("scientific_name"), rs.getString("specific_location"),
                rs.getObject("planted_on", java.time.LocalDate.class), rs.getString("note"), rs.getTimestamp("added_at").toInstant(),
                rs.getTimestamp("photo_updated_at") == null ? null : rs.getTimestamp("photo_updated_at").toInstant()), id, owner);
    }

    private UUID owner(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record Garden(UUID id, String name, String locationType, String locationDetail, String description, Instant createdAt, Instant updatedAt) {}
    public record GardenRequest(@NotBlank @Size(max=160) String name,
                                @NotNull @Pattern(regexp="balcony|rooftop|garden|indoor|greenhouse|other") String locationType,
                                @Size(max=240) String locationDetail, String description) {}
    public record OwnedPlant(UUID id, UUID catalogId, UUID gardenId, String displayName, String commonName, String scientificName,
                             String specificLocation, java.time.LocalDate plantedOn, String note, Instant addedAt, Instant photoUpdatedAt) {}
    public record OwnedPlantRequest(@NotNull UUID catalogId, UUID gardenId, @NotBlank @Size(max=200) String displayName,
                                    @Size(max=200) String specificLocation, java.time.LocalDate plantedOn, String note) {}
    public record OwnedPlantUpdate(@NotBlank @Size(max=200) String displayName, UUID gardenId,
                                   @Size(max=200) String specificLocation, java.time.LocalDate plantedOn, String note) {}
}
