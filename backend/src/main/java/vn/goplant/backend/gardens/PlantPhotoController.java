package vn.goplant.backend.gardens;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.UUID;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/v1/plants/{id}/photo")
public class PlantPhotoController {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final long MAX_PIXELS = 20_000_000L;
    private final JdbcTemplate jdbc;

    public PlantPhotoController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ResponseEntity<Void> upload(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                       @RequestPart("file") MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Ảnh phải có dung lượng từ 1 byte đến 5 MB.");
        }
        byte[] bytes;
        try { bytes = file.getBytes(); }
        catch (IOException exception) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không đọc được tệp ảnh."); }

        String contentType = detectAndValidate(bytes);
        UUID ownerId = UUID.fromString(jwt.getSubject());
        int owned = jdbc.queryForObject("SELECT count(*) FROM user_plants WHERE id=? AND owner_user_id=? AND archived_at IS NULL",
                Integer.class, id, ownerId);
        if (owned == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy cây trong tài khoản.");

        jdbc.update("""
                INSERT INTO user_plant_photos(user_plant_id,content_type,image_bytes,updated_at)
                VALUES (?,?,?,now())
                ON CONFLICT (user_plant_id) DO UPDATE SET content_type=EXCLUDED.content_type,
                    image_bytes=EXCLUDED.image_bytes,updated_at=now()
                """, id, contentType, bytes);
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

    private String detectAndValidate(byte[] bytes) {
        String contentType;
        if (bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
                && bytes[4] == 0x0d && bytes[5] == 0x0a && bytes[6] == 0x1a && bytes[7] == 0x0a) {
            contentType = MediaType.IMAGE_PNG_VALUE;
        } else if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff) {
            contentType = MediaType.IMAGE_JPEG_VALUE;
        } else {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Chỉ hỗ trợ ảnh JPEG hoặc PNG.");
        }

        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("Unsupported image format");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels < 1 || pixels > MAX_PIXELS) {
                    throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Kích thước ảnh tối đa là 20 megapixel.");
                }
                if (reader.read(0) == null) throw new IOException("Invalid image");
            } finally { reader.dispose(); }
        } catch (ResponseStatusException exception) { throw exception; }
        catch (IOException exception) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tệp ảnh không hợp lệ."); }
        return contentType;
    }

    private record Photo(String contentType, byte[] bytes) {}
}
