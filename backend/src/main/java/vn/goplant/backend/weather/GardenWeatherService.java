package vn.goplant.backend.weather;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Outdoor weather for a garden. Results are cached per garden in {@code garden_weather_snapshots}
 * for {@code goplant.weather.cache-minutes}; a forced refresh is honoured at most once per
 * {@code goplant.weather.min-refresh-seconds}. When OpenWeatherMap fails, the last snapshot is
 * returned and flagged as stale.
 */
@Service
public class GardenWeatherService {
    public static final String STATUS_OK = "OK";
    public static final String STATUS_NO_LOCATION = "NO_LOCATION";
    public static final String STATUS_NOT_CONFIGURED = "NOT_CONFIGURED";
    public static final String STATUS_UNAVAILABLE = "UNAVAILABLE";

    private static final double COORDINATE_TOLERANCE = 0.0005;

    private final JdbcTemplate jdbc;
    private final OpenWeatherClient client;
    private final Clock clock;
    private final Duration cacheTtl;
    private final Duration minRefreshInterval;

    public GardenWeatherService(JdbcTemplate jdbc, OpenWeatherClient client, Clock clock,
                                @Value("${goplant.weather.cache-minutes:30}") int cacheMinutes,
                                @Value("${goplant.weather.min-refresh-seconds:120}") int minRefreshSeconds) {
        this.jdbc = jdbc;
        this.client = client;
        this.clock = clock;
        this.cacheTtl = Duration.ofMinutes(Math.max(1, cacheMinutes));
        this.minRefreshInterval = Duration.ofSeconds(Math.max(0, minRefreshSeconds));
    }

    public GardenWeather current(UUID owner, UUID gardenId, boolean forceRefresh) {
        GardenLocation garden = jdbc.query("""
                        SELECT g.id,g.location_type,g.province_code,g.latitude,g.longitude,g.location_source
                        FROM gardens g WHERE g.id=? AND g.owner_user_id=?
                        """, GardenWeatherService::mapGarden, gardenId, owner)
                .stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Garden not found"));

        if (garden.latitude() == null || garden.longitude() == null) {
            return GardenWeather.empty(garden, STATUS_NO_LOCATION);
        }

        Instant now = clock.instant();
        Optional<Snapshot> cached = jdbc.query("""
                        SELECT source_latitude,source_longitude,location_name,temperature_c,feels_like_c,temp_min_c,temp_max_c,
                               humidity_pct,pressure_hpa,wind_speed_ms,clouds_pct,condition_code,condition_main,
                               condition_description,icon_code,observed_at,fetched_at
                        FROM garden_weather_snapshots WHERE garden_id=?
                        """, GardenWeatherService::mapSnapshot, gardenId)
                .stream().findFirst()
                .filter(snapshot -> sameLocation(snapshot, garden));

        if (cached.isPresent()) {
            Duration age = Duration.between(cached.get().fetchedAt(), now);
            boolean fresh = age.compareTo(cacheTtl) < 0;
            boolean refreshAllowed = age.compareTo(minRefreshInterval) >= 0;
            if (fresh && (!forceRefresh || !refreshAllowed)) {
                return build(garden, cached.get(), STATUS_OK, false, owner);
            }
        }

        if (!client.isConfigured()) {
            return cached.map(snapshot -> build(garden, snapshot, STATUS_NOT_CONFIGURED, true, owner))
                    .orElseGet(() -> GardenWeather.empty(garden, STATUS_NOT_CONFIGURED));
        }

        try {
            OpenWeatherClient.Observation observation = client.current(garden.latitude(), garden.longitude());
            Snapshot snapshot = Snapshot.from(observation, garden.latitude(), garden.longitude(), now);
            save(gardenId, snapshot);
            return build(garden, snapshot, STATUS_OK, false, owner);
        } catch (WeatherUnavailableException exception) {
            return cached.map(snapshot -> build(garden, snapshot, STATUS_UNAVAILABLE, true, owner))
                    .orElseGet(() -> GardenWeather.empty(garden, STATUS_UNAVAILABLE));
        }
    }

    private boolean sameLocation(Snapshot snapshot, GardenLocation garden) {
        return garden.latitude() != null && garden.longitude() != null
                && Math.abs(snapshot.sourceLatitude() - garden.latitude()) < COORDINATE_TOLERANCE
                && Math.abs(snapshot.sourceLongitude() - garden.longitude()) < COORDINATE_TOLERANCE;
    }

    private void save(UUID gardenId, Snapshot s) {
        jdbc.update("""
                INSERT INTO garden_weather_snapshots(garden_id,source_latitude,source_longitude,location_name,temperature_c,
                    feels_like_c,temp_min_c,temp_max_c,humidity_pct,pressure_hpa,wind_speed_ms,clouds_pct,condition_code,
                    condition_main,condition_description,icon_code,observed_at,fetched_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT (garden_id) DO UPDATE SET
                    source_latitude=EXCLUDED.source_latitude, source_longitude=EXCLUDED.source_longitude,
                    location_name=EXCLUDED.location_name, temperature_c=EXCLUDED.temperature_c,
                    feels_like_c=EXCLUDED.feels_like_c, temp_min_c=EXCLUDED.temp_min_c, temp_max_c=EXCLUDED.temp_max_c,
                    humidity_pct=EXCLUDED.humidity_pct, pressure_hpa=EXCLUDED.pressure_hpa,
                    wind_speed_ms=EXCLUDED.wind_speed_ms, clouds_pct=EXCLUDED.clouds_pct,
                    condition_code=EXCLUDED.condition_code, condition_main=EXCLUDED.condition_main,
                    condition_description=EXCLUDED.condition_description, icon_code=EXCLUDED.icon_code,
                    observed_at=EXCLUDED.observed_at, fetched_at=EXCLUDED.fetched_at
                """,
                gardenId, s.sourceLatitude(), s.sourceLongitude(), s.locationName(), s.temperatureC(),
                s.feelsLikeC(), s.tempMinC(), s.tempMaxC(), s.humidityPct(), s.pressureHpa(), s.windSpeedMs(),
                s.cloudsPct(), s.conditionCode(), s.conditionMain(), s.conditionDescription(), s.iconCode(),
                Timestamp.from(s.observedAt()), Timestamp.from(s.fetchedAt()));
    }

    private GardenWeather build(GardenLocation garden, Snapshot snapshot, String status, boolean stale, UUID owner) {
        return new GardenWeather(
                garden.id(), status, stale, isOutdoor(garden.locationType()),
                garden.locationSource(), garden.provinceCode(),
                VietnamProvinces.find(garden.provinceCode()).map(VietnamProvinces.Province::name).orElse(null),
                garden.latitude(), garden.longitude(),
                snapshot.locationName(), snapshot.temperatureC(), snapshot.feelsLikeC(), snapshot.tempMinC(),
                snapshot.tempMaxC(), snapshot.humidityPct(), snapshot.pressureHpa(), snapshot.windSpeedMs(),
                snapshot.cloudsPct(), snapshot.conditionCode(), snapshot.conditionMain(),
                snapshot.conditionDescription(), snapshot.iconCode(), snapshot.observedAt(), snapshot.fetchedAt(),
                plantAlerts(owner, garden.id(), snapshot.temperatureC()));
    }

    /** Plants in the garden whose catalog temperature range does not include the current temperature. */
    private List<PlantTemperatureAlert> plantAlerts(UUID owner, UUID gardenId, BigDecimal temperatureC) {
        if (temperatureC == null) return List.of();
        double temperature = temperatureC.doubleValue();
        List<PlantTemperatureAlert> alerts = new ArrayList<>();
        List<PlantRange> plants = jdbc.query("""
                        SELECT p.id,p.display_name,c.temperature_range
                        FROM user_plants p JOIN plant_catalog c ON c.id=p.plant_catalog_id
                        WHERE p.owner_user_id=? AND p.garden_id=? AND p.archived_at IS NULL AND c.temperature_range IS NOT NULL
                        ORDER BY p.display_name
                        """,
                (rs, row) -> new PlantRange(rs.getObject("id", UUID.class), rs.getString("display_name"),
                        rs.getString("temperature_range")),
                owner, gardenId);
        for (PlantRange plant : plants) {
            TemperatureRange.parse(plant.rangeText()).ifPresent(range -> {
                String level = temperature < range.minC() ? "too_cold" : temperature > range.maxC() ? "too_hot" : null;
                if (level != null) {
                    alerts.add(new PlantTemperatureAlert(plant.id(), plant.displayName(), plant.rangeText(),
                            range.minC(), range.maxC(), level));
                }
            });
        }
        return alerts;
    }

    private record PlantRange(UUID id, String displayName, String rangeText) {}

    private static boolean isOutdoor(String locationType) {
        return !"indoor".equals(locationType) && !"greenhouse".equals(locationType);
    }

    private static GardenLocation mapGarden(ResultSet rs, int row) throws SQLException {
        return new GardenLocation(rs.getObject("id", UUID.class), rs.getString("location_type"),
                rs.getString("province_code"), toDouble(rs.getObject("latitude")), toDouble(rs.getObject("longitude")),
                rs.getString("location_source"));
    }

    private static Double toDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private static Snapshot mapSnapshot(ResultSet rs, int row) throws SQLException {
        return new Snapshot(rs.getDouble("source_latitude"), rs.getDouble("source_longitude"), rs.getString("location_name"),
                rs.getBigDecimal("temperature_c"), rs.getBigDecimal("feels_like_c"), rs.getBigDecimal("temp_min_c"),
                rs.getBigDecimal("temp_max_c"), toInteger(rs.getObject("humidity_pct")),
                toInteger(rs.getObject("pressure_hpa")), rs.getBigDecimal("wind_speed_ms"),
                toInteger(rs.getObject("clouds_pct")), toInteger(rs.getObject("condition_code")),
                rs.getString("condition_main"), rs.getString("condition_description"), rs.getString("icon_code"),
                rs.getTimestamp("observed_at").toInstant(), rs.getTimestamp("fetched_at").toInstant());
    }

    private static Integer toInteger(Object value) {
        return value instanceof Number number ? number.intValue() : null;
    }

    record GardenLocation(UUID id, String locationType, String provinceCode, Double latitude, Double longitude,
                          String locationSource) {}

    record Snapshot(double sourceLatitude, double sourceLongitude, String locationName, BigDecimal temperatureC,
                    BigDecimal feelsLikeC, BigDecimal tempMinC, BigDecimal tempMaxC, Integer humidityPct,
                    Integer pressureHpa, BigDecimal windSpeedMs, Integer cloudsPct, Integer conditionCode,
                    String conditionMain, String conditionDescription, String iconCode, Instant observedAt,
                    Instant fetchedAt) {
        static Snapshot from(OpenWeatherClient.Observation o, double latitude, double longitude, Instant fetchedAt) {
            return new Snapshot(latitude, longitude, o.locationName(), o.temperatureC(), o.feelsLikeC(), o.tempMinC(),
                    o.tempMaxC(), o.humidityPct(), o.pressureHpa(), o.windSpeedMs(), o.cloudsPct(), o.conditionCode(),
                    o.conditionMain(), o.conditionDescription(), o.iconCode(), o.observedAt(), fetchedAt);
        }
    }

    public record PlantTemperatureAlert(UUID plantId, String displayName, String temperatureRange,
                                        double minC, double maxC, String level) {}

    public record GardenWeather(
            UUID gardenId,
            String status,
            boolean stale,
            boolean outdoor,
            String locationSource,
            String provinceCode,
            String provinceName,
            Double latitude,
            Double longitude,
            String locationName,
            BigDecimal temperatureC,
            BigDecimal feelsLikeC,
            BigDecimal tempMinC,
            BigDecimal tempMaxC,
            Integer humidityPct,
            Integer pressureHpa,
            BigDecimal windSpeedMs,
            Integer cloudsPct,
            Integer conditionCode,
            String conditionMain,
            String conditionDescription,
            String iconCode,
            Instant observedAt,
            Instant fetchedAt,
            List<PlantTemperatureAlert> plantAlerts) {

        static GardenWeather empty(GardenLocation garden, String status) {
            return new GardenWeather(garden.id(), status, false, isOutdoor(garden.locationType()),
                    garden.locationSource(), garden.provinceCode(),
                    VietnamProvinces.find(garden.provinceCode()).map(VietnamProvinces.Province::name).orElse(null),
                    garden.latitude(), garden.longitude(), null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, List.of());
        }
    }
}
