package vn.goplant.backend.config;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Shared validation for user-uploaded JPEG and PNG images (size <= 5 MB, magic bytes, <= 20 MP).
 */
public final class ImageValidator {
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    public static final long MAX_PIXELS = 20_000_000L;

    private ImageValidator() {}

    public record ValidatedImage(String contentType, byte[] bytes) {}

    public static ValidatedImage validate(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Ảnh phải có dung lượng từ 1 byte đến 5 MB.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không đọc được tệp ảnh.");
        }
        return new ValidatedImage(detectAndValidate(bytes), bytes);
    }

    public static String detectAndValidate(byte[] bytes) {
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
            } finally {
                reader.dispose();
            }
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tệp ảnh không hợp lệ.");
        }
        return contentType;
    }
}
