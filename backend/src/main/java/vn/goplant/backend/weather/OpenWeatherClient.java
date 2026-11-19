package vn.goplant.backend.weather;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Thin client for the OpenWeatherMap Current Weather API (https://openweathermap.org/current).
 * The API key is read from configuration and is never written to logs or error messages.
 */
@Component
public class OpenWeatherClient {
    private static final Logger log = LoggerFactory.getLogger(OpenWeatherClient.class);

    private final RestClient rest;
    private final String apiKey;

    public OpenWeatherClient(RestClient.Builder builder,
                             @Value("${goplant.weather.base-url:https://api.openweathermap.org}") String baseUrl,
                             @Value("${goplant.weather.api-key:}") String apiKey,
                             @Value("${goplant.weather.timeout-seconds:8}") int timeoutSeconds) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(timeoutSeconds));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        this.rest = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    public boolean isConfigured() {
        return !apiKey.isEmpty();
    }

    /** Current conditions at the given coordinates, in metric units with Vietnamese descriptions. */
    public Observation current(double latitude, double longitude) {
        if (!isConfigured()) throw new WeatherUnavailableException("OpenWeatherMap API key is not configured");
        JsonNode body;
        try {
            body = rest.get()
                    .uri(uri -> uri.path("/data/2.5/weather")
                            .queryParam("lat", latitude)
                            .queryParam("lon", longitude)
                            .queryParam("units", "metric")
                            .queryParam("lang", "vi")
                            .queryParam("appid", apiKey)
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            // Only the status code is logged: the request URL contains the API key.
            log.warn("OpenWeatherMap request failed with HTTP {}", exception.getStatusCode().value());
            throw new WeatherUnavailableException("OpenWeatherMap returned HTTP " + exception.getStatusCode().value());
        } catch (RestClientException exception) {
            log.warn("OpenWeatherMap request failed: {}", exception.getClass().getSimpleName());
            throw new WeatherUnavailableException("OpenWeatherMap is unreachable");
        }
        if (body == null || !body.path("main").has("temp")) {
            throw new WeatherUnavailableException("OpenWeatherMap returned an unexpected response");
        }
        JsonNode main = body.path("main");
        JsonNode weather = body.path("weather").path(0);
        long dt = body.path("dt").asLong(0);
        return new Observation(
                text(body, "name"),
                decimal(main, "temp"),
                decimal(main, "feels_like"),
                decimal(main, "temp_min"),
                decimal(main, "temp_max"),
                integer(main, "humidity"),
                integer(main, "pressure"),
                decimal(body.path("wind"), "speed"),
                integer(body.path("clouds"), "all"),
                integer(weather, "id"),
                text(weather, "main"),
                text(weather, "description"),
                text(weather, "icon"),
                dt > 0 ? Instant.ofEpochSecond(dt) : Instant.now());
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.decimalValue() : null;
    }

    private static Integer integer(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.intValue() : null;
    }

    public record Observation(
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
            Instant observedAt) {}
}
