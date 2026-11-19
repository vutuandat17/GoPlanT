package vn.goplant.backend.weather;

import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class WeatherController {
    private final GardenWeatherService weather;

    public WeatherController(GardenWeatherService weather) {
        this.weather = weather;
    }

    /** The 34 provinces/cities a garden can be located in when GPS is not used. */
    @GetMapping("/weather/provinces")
    public List<VietnamProvinces.Province> provinces() {
        return VietnamProvinces.ALL;
    }

    /**
     * Current outdoor weather at the garden's location. {@code refresh=true} bypasses the cache,
     * limited to one upstream call per garden every {@code goplant.weather.min-refresh-seconds}.
     */
    @GetMapping("/gardens/{gardenId}/weather")
    public GardenWeatherService.GardenWeather gardenWeather(@AuthenticationPrincipal Jwt jwt,
                                                           @PathVariable UUID gardenId,
                                                           @RequestParam(defaultValue = "false") boolean refresh) {
        return weather.current(UUID.fromString(jwt.getSubject()), gardenId, refresh);
    }
}
