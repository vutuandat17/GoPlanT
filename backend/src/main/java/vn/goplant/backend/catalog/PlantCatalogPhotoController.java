package vn.goplant.backend.catalog;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.config.ImageValidator;

@RestController
public class PlantCatalogPhotoController {
    private final JdbcTemplate jdbc;

    public PlantCatalogPhotoController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping(value = "/api/v1/admin/catalog/plants/{id}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ResponseEntity<Void> upload(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        var image = ImageValidator.validate(file);
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM plant_catalog WHERE id=?", Integer.class, id);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy loài cây trong danh mục.");
        }
        jdbc.update("""
                INSERT INTO plant_catalog_photos(plant_catalog_id,content_type,image_bytes,updated_at)
                VALUES (?,?,?,now())
                ON CONFLICT (plant_catalog_id) DO UPDATE SET content_type=EXCLUDED.content_type,
                    image_bytes=EXCLUDED.image_bytes,updated_at=now()
                """, id, image.contentType(), image.bytes());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/catalog/plants/{id}/photo")
    public ResponseEntity<byte[]> get(@PathVariable UUID id) {
        var photos = jdbc.query("""
                SELECT ph.content_type, ph.image_bytes
                FROM plant_catalog_photos ph
                JOIN plant_catalog c ON c.id = ph.plant_catalog_id
                WHERE c.id=?
                """, (rs, row) -> new Photo(rs.getString("content_type"), rs.getBytes("image_bytes")), id);
        if (photos.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Photo photo = photos.getFirst();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.noCache())
                .body(photo.bytes());
    }

    @DeleteMapping("/api/v1/admin/catalog/plants/{id}/photo")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM plant_catalog WHERE id=?", Integer.class, id);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy loài cây trong danh mục.");
        }
        jdbc.update("DELETE FROM plant_catalog_photos WHERE plant_catalog_id=?", id);
        return ResponseEntity.noContent().build();
    }

    private record Photo(String contentType, byte[] bytes) {}
}
