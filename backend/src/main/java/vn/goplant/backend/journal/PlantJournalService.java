package vn.goplant.backend.journal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.config.ImageValidator;

@Service
public class PlantJournalService {
    public static final int MAX_PHOTOS_PER_JOURNAL = 5;
    public static final Set<String> LOG_TYPES = Set.of("growth", "watering", "fertilizing", "pest", "pruning", "other");
    public static final Set<String> HEALTH_STATUSES = Set.of("healthy", "warning", "critical");

    private static final String JOURNAL_SELECT = """
            SELECT j.id, j.user_plant_id, p.display_name AS plant_name, c.scientific_name AS plant_scientific_name,
                   c.category AS plant_category, p.garden_id, g.name AS garden_name, j.care_task_id,
                   j.entry_date, j.log_type, j.health_status, j.title, j.note, j.created_at, j.updated_at
            FROM plant_journals j
            JOIN user_plants p ON p.id = j.user_plant_id
            JOIN plant_catalog c ON c.id = p.plant_catalog_id
            LEFT JOIN gardens g ON g.id = p.garden_id
            """;

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public PlantJournalService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public List<JournalEntry> listAll(UUID owner) {
        var rows = jdbc.query(JOURNAL_SELECT + """
                WHERE j.owner_user_id=? AND p.archived_at IS NULL
                ORDER BY j.entry_date DESC, j.created_at DESC
                LIMIT 200
                """, (rs, n) -> mapRow(rs), owner);
        return attachPhotoIds(owner, rows);
    }

    public List<JournalEntry> listByPlant(UUID owner, UUID plantId) {
        requireActivePlant(owner, plantId);
        var rows = jdbc.query(JOURNAL_SELECT + """
                WHERE j.owner_user_id=? AND j.user_plant_id=? AND p.archived_at IS NULL
                ORDER BY j.entry_date DESC, j.created_at DESC
                """, (rs, n) -> mapRow(rs), owner, plantId);
        return attachPhotoIds(owner, rows);
    }

    public JournalEntry get(UUID owner, UUID journalId) {
        var rows = jdbc.query(JOURNAL_SELECT + """
                WHERE j.id=? AND j.owner_user_id=? AND p.archived_at IS NULL
                """, (rs, n) -> mapRow(rs), journalId, owner);
        if (rows.isEmpty()) throw notFound("Không tìm thấy bài nhật ký.");
        return attachPhotoIds(owner, rows).getFirst();
    }

    @Transactional
    public JournalEntry create(UUID owner, UUID plantId, JournalRequest request) {
        requireActivePlant(owner, plantId);
        String logType = normalizeLogType(request.logType());
        String healthStatus = normalizeHealthStatus(request.healthStatus());
        LocalDate entryDate = request.entryDate() != null ? request.entryDate() : LocalDate.now(clock.withZone(userZone(owner)));
        if (request.careTaskId() != null) {
            Integer taskCount = jdbc.queryForObject(
                    "SELECT count(*) FROM care_tasks WHERE id=? AND owner_user_id=? AND user_plant_id=?",
                    Integer.class, request.careTaskId(), owner, plantId);
            if (taskCount == null || taskCount == 0) {
                throw badRequest("Công việc chăm sóc liên kết không tồn tại hoặc không thuộc cây này.");
            }
        }
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO plant_journals(id,owner_user_id,user_plant_id,care_task_id,entry_date,log_type,health_status,title,note)
                VALUES (?,?,?,?,?,?,?,?,?)
                """, id, owner, plantId, request.careTaskId(), entryDate, logType, healthStatus,
                blankToNull(request.title()), request.note().trim());
        return get(owner, id);
    }

    @Transactional
    public JournalEntry update(UUID owner, UUID journalId, JournalUpdateRequest request) {
        String logType = normalizeLogType(request.logType());
        String healthStatus = normalizeHealthStatus(request.healthStatus());
        LocalDate entryDate = request.entryDate() != null ? request.entryDate() : LocalDate.now(clock.withZone(userZone(owner)));
        int changed = jdbc.update("""
                UPDATE plant_journals j
                SET entry_date=?, log_type=?, health_status=?, title=?, note=?, updated_at=now()
                FROM user_plants p
                WHERE j.id=? AND j.owner_user_id=? AND p.id=j.user_plant_id AND p.archived_at IS NULL
                """, entryDate, logType, healthStatus, blankToNull(request.title()), request.note().trim(), journalId, owner);
        if (changed == 0) throw notFound("Không tìm thấy bài nhật ký.");
        return get(owner, journalId);
    }

    @Transactional
    public void delete(UUID owner, UUID journalId) {
        int changed = jdbc.update("DELETE FROM plant_journals WHERE id=? AND owner_user_id=?", journalId, owner);
        if (changed == 0) throw notFound("Không tìm thấy bài nhật ký.");
    }

    @Transactional
    public PhotoMeta addPhoto(UUID owner, UUID journalId, MultipartFile file) {
        var image = ImageValidator.validate(file);
        Integer exists = jdbc.queryForObject("""
                SELECT count(*) FROM plant_journals j
                JOIN user_plants p ON p.id = j.user_plant_id
                WHERE j.id=? AND j.owner_user_id=? AND p.archived_at IS NULL
                """, Integer.class, journalId, owner);
        if (exists == null || exists == 0) throw notFound("Không tìm thấy bài nhật ký.");

        Integer currentPhotos = jdbc.queryForObject(
                "SELECT count(*) FROM journal_photos WHERE journal_id=? AND owner_user_id=?",
                Integer.class, journalId, owner);
        if (currentPhotos != null && currentPhotos >= MAX_PHOTOS_PER_JOURNAL) {
            throw badRequest("Mỗi bài nhật ký chỉ được đính kèm tối đa " + MAX_PHOTOS_PER_JOURNAL + " ảnh.");
        }

        UUID photoId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO journal_photos(id,journal_id,owner_user_id,content_type,image_bytes)
                VALUES (?,?,?,?,?)
                """, photoId, journalId, owner, image.contentType(), image.bytes());
        return new PhotoMeta(photoId, journalId, image.contentType(), Instant.now(clock));
    }

    public PhotoData getPhoto(UUID owner, UUID journalId, UUID photoId) {
        var rows = jdbc.query("""
                SELECT ph.content_type, ph.image_bytes
                FROM journal_photos ph
                JOIN plant_journals j ON j.id = ph.journal_id
                JOIN user_plants p ON p.id = j.user_plant_id
                WHERE ph.id=? AND ph.journal_id=? AND ph.owner_user_id=? AND p.archived_at IS NULL
                """, (rs, row) -> new PhotoData(rs.getString("content_type"), rs.getBytes("image_bytes")), photoId, journalId, owner);
        if (rows.isEmpty()) throw notFound("Không tìm thấy ảnh nhật ký.");
        return rows.getFirst();
    }

    @Transactional
    public void deletePhoto(UUID owner, UUID journalId, UUID photoId) {
        int changed = jdbc.update("DELETE FROM journal_photos WHERE id=? AND journal_id=? AND owner_user_id=?", photoId, journalId, owner);
        if (changed == 0) throw notFound("Không tìm thấy ảnh nhật ký.");
    }

    private List<JournalEntry> attachPhotoIds(UUID owner, List<JournalRow> rows) {
        if (rows.isEmpty()) return List.of();
        List<UUID> journalIds = rows.stream().map(JournalRow::id).toList();
        String placeholders = String.join(",", Collections.nCopies(journalIds.size(), "?"));
        List<Object> params = new ArrayList<>();
        params.add(owner);
        params.addAll(journalIds);

        Map<UUID, List<UUID>> photosByJournal = new HashMap<>();
        jdbc.query("SELECT id, journal_id FROM journal_photos WHERE owner_user_id=? AND journal_id IN (" + placeholders + ") ORDER BY created_at ASC",
                rs -> {
                    UUID jId = rs.getObject("journal_id", UUID.class);
                    UUID pId = rs.getObject("id", UUID.class);
                    photosByJournal.computeIfAbsent(jId, k -> new ArrayList<>()).add(pId);
                }, params.toArray());

        return rows.stream().map(r -> new JournalEntry(
                r.id(), r.plantId(), r.plantName(), r.plantScientificName(), r.plantCategory(),
                r.gardenId(), r.gardenName(), r.careTaskId(), r.entryDate(), r.logType(),
                r.healthStatus(), r.title(), r.note(), photosByJournal.getOrDefault(r.id(), List.of()),
                r.createdAt(), r.updatedAt()
        )).toList();
    }

    private JournalRow mapRow(ResultSet rs) throws SQLException {
        return new JournalRow(
                rs.getObject("id", UUID.class),
                rs.getObject("user_plant_id", UUID.class),
                rs.getString("plant_name"),
                rs.getString("plant_scientific_name"),
                rs.getString("plant_category"),
                rs.getObject("garden_id", UUID.class),
                rs.getString("garden_name"),
                rs.getObject("care_task_id", UUID.class),
                rs.getObject("entry_date", LocalDate.class),
                rs.getString("log_type"),
                rs.getString("health_status"),
                rs.getString("title"),
                rs.getString("note"),
                instant(rs, "created_at"),
                instant(rs, "updated_at")
        );
    }

    private void requireActivePlant(UUID owner, UUID plantId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, plantId, owner);
        if (count == null || count == 0) throw notFound("Không tìm thấy cây trong tài khoản.");
    }

    private ZoneId userZone(UUID owner) {
        var zones = jdbc.queryForList("SELECT timezone FROM users WHERE id=?", String.class, owner);
        return zones.isEmpty() ? ZoneId.of("Asia/Ho_Chi_Minh") : ZoneId.of(zones.getFirst());
    }

    private static String normalizeLogType(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!LOG_TYPES.contains(normalized)) {
            throw badRequest("Loại ghi nhận không hợp lệ: " + value);
        }
        return normalized;
    }

    private static String normalizeHealthStatus(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!HEALTH_STATUSES.contains(normalized)) {
            throw badRequest("Tình trạng sức khỏe không hợp lệ: " + value);
        }
        return normalized;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static ResponseStatusException notFound(String msg) { return new ResponseStatusException(HttpStatus.NOT_FOUND, msg); }
    private static ResponseStatusException badRequest(String msg) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg); }

    public record JournalRequest(
            LocalDate entryDate,
            @NotBlank String logType,
            @NotBlank String healthStatus,
            @Size(max = 160) String title,
            @NotBlank @Size(max = 5000) String note,
            UUID careTaskId) {}

    public record JournalUpdateRequest(
            LocalDate entryDate,
            @NotBlank String logType,
            @NotBlank String healthStatus,
            @Size(max = 160) String title,
            @NotBlank @Size(max = 5000) String note) {}

    public record JournalEntry(
            UUID id, UUID plantId, String plantName, String plantScientificName, String plantCategory,
            UUID gardenId, String gardenName, UUID careTaskId, LocalDate entryDate, String logType,
            String healthStatus, String title, String note, List<UUID> photoIds,
            Instant createdAt, Instant updatedAt) {}

    public record PhotoMeta(UUID id, UUID journalId, String contentType, Instant createdAt) {}
    public record PhotoData(String contentType, byte[] bytes) {}

    private record JournalRow(
            UUID id, UUID plantId, String plantName, String plantScientificName, String plantCategory,
            UUID gardenId, String gardenName, UUID careTaskId, LocalDate entryDate, String logType,
            String healthStatus, String title, String note, Instant createdAt, Instant updatedAt) {}
}
