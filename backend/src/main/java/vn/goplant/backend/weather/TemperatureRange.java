package vn.goplant.backend.weather;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the free-text {@code plant_catalog.temperature_range} entered by admins (for example
 * "18–28°C", "18 - 28 °C", "18 đến 28") into numeric bounds. Unparseable text yields empty.
 */
public record TemperatureRange(double minC, double maxC) {
    private static final Pattern RANGE = Pattern.compile(
            "(-?\\d+(?:[.,]\\d+)?)\\s*(?:°\\s*C?)?\\s*(?:–|—|-|~|to|đến|den)\\s*(-?\\d+(?:[.,]\\d+)?)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    public static Optional<TemperatureRange> parse(String text) {
        if (text == null || text.isBlank()) return Optional.empty();
        Matcher matcher = RANGE.matcher(text);
        if (!matcher.find()) return Optional.empty();
        double first = Double.parseDouble(matcher.group(1).replace(',', '.'));
        double second = Double.parseDouble(matcher.group(2).replace(',', '.'));
        return Optional.of(new TemperatureRange(Math.min(first, second), Math.max(first, second)));
    }
}
