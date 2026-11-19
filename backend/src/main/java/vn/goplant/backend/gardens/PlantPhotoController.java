package vn.goplant.backend.gardens;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.config.ImageValidator;

@RestController
@RequestMapping("/api/v1/plants/{id}/photo")
public class PlantPhotoController {
    private final JdbcTemplate jdbc;

    public PlantPhotoController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ResponseEntity<Void> upload(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                       @RequestPart("file") MultipartFile file) {
        var image = ImageValidator.validate(file);
        UUID ownerId = UUID.fromString(jwt.getSubject());
        int owned = jdbc.queryForObject("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, id, ownerId);
        if (owned == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy cây trong tài khoản.");

        jdbc.update("""
                INSERT INTO user_plant_photos(user_plant_id,content_type,image_bytes,updated_at)
                VALUES (?,?,?,now())
                ON CONFLICT (user_plant_id) DO UPDATE SET content_type=EXCLUDED.content_type,
                    image_bytes=EXCLUDED.image_bytes,updated_at=now()
                """, id, image.contentType(), image.bytes());
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<byte[]> get(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        UUID ownerId = UUID.fromString(jwt.getSubject());
        var photos = jdbc.query("""
                SELECT ph.content_type,ph.image_bytes FROM user_plant_photos ph
                JOIN user_plants p ON p.id=ph.user_plant_id
                WHERE p.id=? AND p.owner_user_id=? AND p.archived_at IS NULL
                """, (rs, row) -> new Photo(rs.getString("content_type"), rs.getBytes("image_bytes")), id, ownerId);
        if (photos.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Photo photo = photos.getFirst();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.noCache()).body(photo.bytes());
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        UUID ownerId = UUID.fromString(jwt.getSubject());
        int owned = jdbc.queryForObject("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, id, ownerId);
        if (owned == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy cây trong tài khoản.");
        jdbc.update("DELETE FROM user_plant_photos WHERE user_plant_id=?", id);
        return ResponseEntity.noContent().build();
    }

    private record Photo(String contentType, byte[] bytes) {}
}
