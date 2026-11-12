package vn.goplant.backend.catalog;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(1)
public class PopularPlantCatalogSeeder implements ApplicationRunner {
    private static final String SOURCE_TITLE = "Plants of the World Online (Royal Botanic Gardens, Kew)";
    private static final List<SeedPlant> PLANTS = List.of(
            new SeedPlant("Trầu bà lá xẻ", "Monstera deliciosa", "Cây nội thất"),
            new SeedPlant("Trầu bà vàng", "Epipremnum aureum", "Cây nội thất"),
            new SeedPlant("Lưỡi hổ", "Dracaena trifasciata", "Cây nội thất"),
            new SeedPlant("Kim tiền", "Zamioculcas zamiifolia", "Cây nội thất"),
            new SeedPlant("Lan ý", "Spathiphyllum wallisii", "Cây nội thất"),
            new SeedPlant("Đa búp đỏ", "Ficus elastica", "Cây nội thất"),
            new SeedPlant("Lan chi", "Chlorophytum comosum", "Cây nội thất"),
            new SeedPlant("Nha đam", "Aloe vera", "Cây gia dụng"),
            new SeedPlant("Lan hồ điệp", "Phalaenopsis amabilis", "Cây hoa"),
            new SeedPlant("Hồng môn", "Anthurium andraeanum", "Cây hoa"),
            new SeedPlant("Dâm bụt", "Hibiscus × rosa-sinensis", "Cây hoa"),
            new SeedPlant("Hoa giấy", "Bougainvillea spectabilis", "Cây hoa"),
            new SeedPlant("Hoa hồng", "Rosa chinensis", "Cây hoa"),
            new SeedPlant("Húng quế", "Ocimum basilicum", "Rau gia vị"),
            new SeedPlant("Bạc hà", "Mentha spicata", "Rau gia vị"),
            new SeedPlant("Rau muống", "Ipomoea aquatica", "Rau ăn lá"),
            new SeedPlant("Cải thìa", "Brassica rapa subsp. chinensis", "Rau ăn lá"),
            new SeedPlant("Cà chua", "Solanum lycopersicum", "Rau ăn quả"),
            new SeedPlant("Ớt", "Capsicum annuum", "Rau ăn quả"),
            new SeedPlant("Dưa leo", "Cucumis sativus", "Rau ăn quả"),
            new SeedPlant("Tắc (quất)", "Citrus × microcarpa", "Cây ăn quả")
    );

    private final JdbcTemplate jdbc;

    public PopularPlantCatalogSeeder(JdbcTemplate jdbc) { this.jdbc = jdbc; }

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

        for (SeedPlant plant : PLANTS) {
            int exists = jdbc.queryForObject("SELECT count(*) FROM plant_catalog WHERE lower(scientific_name)=lower(?)",
                    Integer.class, plant.scientificName());
            if (exists > 0) continue;

            UUID plantId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO plant_catalog(id,common_name,scientific_name,category,publication_status,reviewed_by,reviewed_at)
                    VALUES (?,?,?,?, 'approved', ?, now())
                    """, plantId, plant.commonName(), plant.scientificName(), plant.category(), reviewerId);
            String sourceUrl = "https://powo.science.kew.org/results?q="
                    + URLEncoder.encode(plant.scientificName(), StandardCharsets.UTF_8);
            jdbc.update("""
                    INSERT INTO plant_catalog_sources(plant_catalog_id,source_title,source_url,supports_fields,added_by)
                    VALUES (?,?,?,?::text[],?)
                    """, plantId, SOURCE_TITLE, sourceUrl, "{common_name,scientific_name}", reviewerId);
        }
    }

    private record SeedPlant(String commonName, String scientificName, String category) {}
}
