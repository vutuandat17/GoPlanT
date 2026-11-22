package vn.goplant.backend.auth;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import vn.goplant.backend.config.ImageValidator;

@RestController
public class UserAvatarController {
    private final JdbcTemplate jdbc;
    private final AuthService auth;

    public UserAvatarController(JdbcTemplate jdbc, AuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    @PostMapping(value = "/api/v1/auth/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AuthService.UserView uploadMyAvatar(
            @AuthenticationPrincipal Jwt jwt,
            @RequestPart("file") MultipartFile file) {
        UUID userId = UUID.fromString(jwt.getSubject());
        var image = ImageValidator.validate(file);
        jdbc.update("""
                INSERT INTO user_avatars(user_id, content_type, image_bytes, updated_at)
                VALUES (?, ?, ?, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    content_type = EXCLUDED.content_type,
                    image_bytes = EXCLUDED.image_bytes,
                    updated_at = now()
                """, userId, image.contentType(), image.bytes());
        return auth.getUser(userId);
    }

    @GetMapping("/api/v1/auth/me/avatar")
    public ResponseEntity<byte[]> getMyAvatar(@AuthenticationPrincipal Jwt jwt) {
        return loadAvatar(UUID.fromString(jwt.getSubject()));
    }

    @DeleteMapping("/api/v1/auth/me/avatar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMyAvatar(@AuthenticationPrincipal Jwt jwt) {
        jdbc.update("DELETE FROM user_avatars WHERE user_id = ?", UUID.fromString(jwt.getSubject()));
    }

    @GetMapping("/api/v1/admin/users/{id}/avatar")
    public ResponseEntity<byte[]> getUserAvatarForAdmin(@PathVariable UUID id) {
        return loadAvatar(id);
    }

    private ResponseEntity<byte[]> loadAvatar(UUID userId) {
        var rows = jdbc.query(
                "SELECT content_type, image_bytes FROM user_avatars WHERE user_id = ?",
                (rs, row) -> new AvatarRow(rs.getString("content_type"), rs.getBytes("image_bytes")),
                userId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chưa có ảnh đại diện.");
        }
        AvatarRow avatar = rows.getFirst();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(avatar.contentType()))
                .cacheControl(CacheControl.noCache().cachePrivate())
                .body(avatar.bytes());
    }

    private record AvatarRow(String contentType, byte[] bytes) {}
}
