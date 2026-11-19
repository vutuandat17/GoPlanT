package vn.goplant.backend.weather;

/** Raised when current weather cannot be obtained from OpenWeatherMap. Messages never contain secrets. */
public class WeatherUnavailableException extends RuntimeException {
    public WeatherUnavailableException(String message) {
        super(message);
    }
}
