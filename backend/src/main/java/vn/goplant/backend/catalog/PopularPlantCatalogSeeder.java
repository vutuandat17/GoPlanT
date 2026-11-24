package vn.goplant.backend.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(1)
public class PopularPlantCatalogSeeder implements ApplicationRunner {
    private static final String SOURCE_TITLE = "Plants of the World Online (Royal Botanic Gardens, Kew)";
    private static final String SEED_RESOURCE_PATH = "seed/plants.json";
    private static final String SUPPORTS_FIELDS =
            "{common_name,scientific_name,category,difficulty,light_requirement,water_frequency_days,temperature_range,"
                    + "origin,morphology,overview,toxicity_warning,lifespan,flowering_season,humidity,medium,drainage,"
                    + "mature_size,growth_rate,soil_ph,nutrition}";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public PopularPlantCatalogSeeder(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<UUID> admins = jdbc.query("""
                SELECT u.id FROM users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id AND r.code='admin'
                WHERE u.status='active' ORDER BY u.created_at LIMIT 1
                """, (rs, row) -> rs.getObject("id", UUID.class));
        if (admins.isEmpty()) return;
        UUID reviewerId = admins.getFirst();

        List<SeedPlant> plants = loadSeedPlants();
        for (SeedPlant plant : plants) {
            List<UUID> existingIds = jdbc.query(
                    "SELECT id FROM plant_catalog WHERE lower(scientific_name)=lower(?) LIMIT 1",
                    (rs, row) -> rs.getObject("id", UUID.class),
                    plant.scientificName());

            if (!existingIds.isEmpty()) {
                jdbc.update("""
                        UPDATE plant_catalog SET
                            difficulty = COALESCE(difficulty, ?),
                            light_requirement = COALESCE(light_requirement, ?),
                            water_frequency_days = COALESCE(water_frequency_days, ?),
                            temperature_range = COALESCE(temperature_range, ?),
                            origin = COALESCE(origin, ?),
                            morphology = COALESCE(morphology, ?),
                            overview = COALESCE(overview, ?),
                            toxicity_warning = COALESCE(toxicity_warning, ?),
                            lifespan = COALESCE(lifespan, ?),
                            flowering_season = COALESCE(flowering_season, ?),
                            humidity = COALESCE(humidity, ?),
                            medium = COALESCE(medium, ?),
                            drainage = COALESCE(drainage, ?),
                            mature_size = COALESCE(mature_size, ?),
                            growth_rate = COALESCE(growth_rate, ?),
                            soil_ph = COALESCE(soil_ph, ?),
                            nutrition = COALESCE(nutrition, ?),
                            updated_at = now()
                        WHERE id = ?
                          AND (difficulty IS NULL OR light_requirement IS NULL
                               OR water_frequency_days IS NULL OR temperature_range IS NULL
                               OR origin IS NULL OR morphology IS NULL
                               OR overview IS NULL OR toxicity_warning IS NULL
                               OR lifespan IS NULL OR flowering_season IS NULL
                               OR humidity IS NULL OR medium IS NULL
                               OR drainage IS NULL OR mature_size IS NULL
                               OR growth_rate IS NULL OR soil_ph IS NULL OR nutrition IS NULL)
                        """,
                        plant.difficulty(), plant.lightRequirement(), plant.waterFrequencyDays(),
                        plant.temperatureRange(), plant.origin(), plant.morphology(),
                        plant.overview(), plant.toxicityWarning(),
                        plant.lifespan(), plant.floweringSeason(), plant.humidity(),
                        plant.medium(), plant.drainage(), plant.matureSize(),
                        plant.growthRate(), plant.soilPh(), plant.nutrition(),
                        existingIds.getFirst());
                continue;
            }

            UUID plantId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO plant_catalog(
                        id, common_name, scientific_name, category,
                        difficulty, light_requirement, water_frequency_days, temperature_range,
                        origin, morphology, overview, toxicity_warning,
                        lifespan, flowering_season, humidity, medium, drainage,
                        mature_size, growth_rate, soil_ph, nutrition,
                        publication_status, reviewed_by, reviewed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,now())
                    """,
                    plantId, plant.commonName(), plant.scientificName(), plant.category(),
                    plant.difficulty(), plant.lightRequirement(), plant.waterFrequencyDays(), plant.temperatureRange(),
                    plant.origin(), plant.morphology(), plant.overview(), plant.toxicityWarning(),
                    plant.lifespan(), plant.floweringSeason(), plant.humidity(),
                    plant.medium(), plant.drainage(), plant.matureSize(),
                    plant.growthRate(), plant.soilPh(), plant.nutrition(),
                    reviewerId);

            String sourceUrl = "https://powo.science.kew.org/results?q="
                    + URLEncoder.encode(plant.scientificName(), StandardCharsets.UTF_8);
            jdbc.update("""
                    INSERT INTO plant_catalog_sources(plant_catalog_id,source_title,source_url,supports_fields,added_by)
                    VALUES (?,?,?,?::text[],?)
                    """, plantId, SOURCE_TITLE, sourceUrl, SUPPORTS_FIELDS, reviewerId);
        }
    }

    private List<SeedPlant> loadSeedPlants() {
        ClassPathResource resource = new ClassPathResource(SEED_RESOURCE_PATH);
        try (InputStream input = resource.getInputStream()) {
            return objectMapper.readValue(input, new TypeReference<>() {});
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to load plant catalog seed from " + SEED_RESOURCE_PATH, ex);
        }
    }

    private record SeedPlant(
            String commonName,
            String scientificName,
            String category,
            String difficulty,
            String lightRequirement,
            Integer waterFrequencyDays,
            String temperatureRange,
            String origin,
            String morphology,
            String overview,
            String toxicityWarning,
            String lifespan,
            String floweringSeason,
            String humidity,
            String medium,
            String drainage,
            String matureSize,
            String growthRate,
            String soilPh,
            String nutrition) {}
}
