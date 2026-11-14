package vn.goplant.backend.config;

import java.util.List;

public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalElements,
        int totalPages) {

    public static int normalizePage(int page) {
        return Math.max(0, page);
    }

    public static int normalizeSize(int size) {
        if (size <= 0) {
            return 20;
        }
        return Math.min(size, 100);
    }

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalElements) {
        int safeSize = normalizeSize(size);
        int totalPages = totalElements == 0 ? 0 : (int) Math.ceil((double) totalElements / safeSize);
        return new PageResponse<>(items, normalizePage(page), safeSize, totalElements, totalPages);
    }
}
