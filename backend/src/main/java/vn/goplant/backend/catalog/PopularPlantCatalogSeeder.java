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
            new SeedPlant("Trầu bà lá xẻ", "Monstera deliciosa", "Cây nội thất",
                    "Mexico đến Guatemala; thường sống trong rừng nhiệt đới ẩm.",
                    "Dây leo thân khỏe; lá trưởng thành lớn, xẻ thùy và có các lỗ đặc trưng.",
                    "Loài thuộc họ Ráy (Araceae), phát triển dạng leo và có thể bám vào giá đỡ.",
                    "Các bộ phận tươi có thể gây kích ứng nếu nhai hoặc tiếp xúc nhựa cây."),
            new SeedPlant("Trầu bà vàng", "Epipremnum aureum", "Cây nội thất",
                    "Quần đảo Society ở Polynesia thuộc Pháp; hiện được trồng rộng rãi ở vùng nhiệt đới.",
                    "Dây leo thường xanh, lá hình tim; cây trồng có thể có mảng vàng hoặc kem.",
                    "Cây họ Ráy có thân leo hoặc rủ; có thể trồng trong chậu treo hay dẫn trên trụ.",
                    "Không ăn cây; nhựa chứa tinh thể calcium oxalate có thể gây kích ứng."),
            new SeedPlant("Lưỡi hổ", "Dracaena trifasciata", "Cây nội thất",
                    "Tây và Trung Phi nhiệt đới đến Tanzania.",
                    "Thân rễ tạo bụi; lá mọc thẳng, dày, dạng dải, thường có vân ngang.",
                    "Loài cây thân rễ chịu hạn tốt, trước đây thường được xếp vào chi Sansevieria.",
                    "Không dùng làm thực phẩm; có thể gây khó chịu đường tiêu hóa nếu thú nuôi ăn phải."),
            new SeedPlant("Kim tiền", "Zamioculcas zamiifolia", "Cây nội thất",
                    "Đông Phi nhiệt đới.",
                    "Cây thân rễ; cuống lá mọc thành bụi với nhiều lá chét dày, bóng.",
                    "Loài họ Ráy có thân rễ mọng nước giúp dự trữ nước.",
                    "Nhựa cây có thể gây kích ứng; để xa tầm tay trẻ nhỏ và thú nuôi."),
            new SeedPlant("Lan ý", "Spathiphyllum wallisii", "Cây nội thất",
                    "Trung Mỹ và vùng nhiệt đới Nam Mỹ.",
                    "Bụi lá xanh bóng; cụm hoa gồm mo trắng bao quanh bông mo hình trụ.",
                    "Lan ý là cây thân thảo họ Ráy, được nhận diện bởi mo hoa trắng nổi trên tán lá.",
                    "Không ăn cây; nhựa có thể gây kích ứng miệng và da."),
            new SeedPlant("Đa búp đỏ", "Ficus elastica", "Cây nội thất",
                    "Từ dãy Himalaya phía đông qua Đông Bắc Ấn Độ đến Đông Nam Á.",
                    "Cây gỗ thường xanh; lá đơn to, dày, bóng, chồi non được bao bởi lá kèm đỏ.",
                    "Đa búp đỏ là cây họ Dâu tằm; ngoài tự nhiên có thể phát triển thành cây gỗ lớn.",
                    "Nhựa mủ có thể gây kích ứng da; tránh để nhựa dính vào mắt."),
            new SeedPlant("Lan chi", "Chlorophytum comosum", "Cây nội thất",
                    "Miền nam châu Phi.",
                    "Bụi lá dài cong, thường có sọc sáng; cây mẹ tạo thân bò mang cây con.",
                    "Lan chi là cây thân thảo mọc thành bụi, thường nhân giống bằng các cây con trên thân bò.",
                    "Không dùng cây thay thế thực phẩm hoặc thuốc."),
            new SeedPlant("Nha đam", "Aloe vera", "Cây gia dụng",
                    "Bán đảo Ả Rập; hiện được trồng và nhập tịch rộng ở vùng nhiệt đới.",
                    "Cây mọng nước mọc thành hoa thị; lá dày có răng nhỏ ở mép, cụm hoa mọc trên cuống cao.",
                    "Nha đam thuộc họ Asphodelaceae; lá chứa gel và lớp nhựa vàng riêng biệt.",
                    "Không tự ý ăn hoặc dùng gel chưa sơ chế; nhựa vàng có thể gây tác dụng phụ."),
            new SeedPlant("Lan hồ điệp", "Phalaenopsis amabilis", "Cây hoa",
                    "Đông Nam Á và các đảo lân cận.",
                    "Phong lan biểu sinh, có lá bản rộng mọc thành hai hàng và vòi hoa mang nhiều hoa.",
                    "Lan hồ điệp thuộc họ Orchidaceae; rễ khí sinh và hoa lâu tàn là đặc điểm dễ nhận biết.",
                    "Không bẻ rễ khí sinh khỏe; tránh để nước đọng lâu ở nách lá."),
            new SeedPlant("Hồng môn", "Anthurium andraeanum", "Cây hoa",
                    "Miền tây bắc Nam Mỹ, gồm Colombia và Ecuador.",
                    "Lá xanh bóng hình tim; cụm hoa có mo màu sắc bao quanh bông mo dài.",
                    "Hồng môn là cây họ Ráy; phần giống cánh hoa rực màu thực ra là mo hoa.",
                    "Không ăn cây; tinh thể calcium oxalate có thể gây kích ứng."),
            new SeedPlant("Dâm bụt", "Hibiscus × rosa-sinensis", "Cây hoa",
                    "Nhóm cây lai trồng, có nguồn gốc từ các dòng Hibiscus ở Thái Bình Dương.",
                    "Cây bụi thường xanh; hoa lớn với nhị hợp thành trụ nhị nổi bật.",
                    "Dâm bụt cảnh là nhóm cây bụi nhiệt đới được trồng chủ yếu vì hoa lớn, nhiều màu.",
                    "Không suy diễn công dụng làm thuốc từ tên dân gian; chỉ sử dụng theo hướng dẫn chuyên môn."),
            new SeedPlant("Hoa giấy", "Bougainvillea spectabilis", "Cây hoa",
                    "Nam Mỹ nhiệt đới, đặc biệt là Brazil.",
                    "Cây bụi hoặc dây leo hóa gỗ; cụm hoa nhỏ được bao quanh bởi các lá bắc mỏng nhiều màu.",
                    "Hoa giấy tạo màu sắc chủ yếu từ lá bắc, không phải cánh hoa lớn.",
                    "Cành có gai; dùng găng tay khi cắt tỉa."),
            new SeedPlant("Hoa hồng", "Rosa chinensis", "Cây hoa",
                    "Trung Quốc.",
                    "Cây bụi có gai; lá kép với các lá chét có mép răng cưa; hoa có nhiều cánh.",
                    "Hoa hồng Trung Quốc là một loài hoa hồng quan trọng trong lịch sử lai tạo các giống hồng hiện đại.",
                    "Cành có gai; xử lý cẩn thận khi cắt tỉa."),
            new SeedPlant("Húng quế", "Ocimum basilicum", "Rau gia vị",
                    "Vùng nhiệt đới châu Phi và châu Á; được trồng rộng rãi.",
                    "Cây thân thảo thơm; lá mọc đối, cụm hoa dạng bông ở đầu cành.",
                    "Húng quế thuộc họ Hoa môi (Lamiaceae), được trồng làm rau gia vị.",
                    "Rửa sạch trước khi dùng làm thực phẩm; tinh dầu đậm đặc không dùng thay thuốc."),
            new SeedPlant("Bạc hà", "Mentha spicata", "Rau gia vị",
                    "Châu Âu và vùng ôn đới châu Á; được trồng và nhập tịch ở nhiều nơi.",
                    "Thân thảo thơm có thân vuông; lá mọc đối, mép có răng; cụm hoa ở đầu cành.",
                    "Bạc hà lục thuộc họ Hoa môi, thường lan rộng bằng thân rễ và thân bò.",
                    "Có thể lan nhanh trong vườn; cân nhắc trồng trong chậu để giới hạn thân rễ."),
            new SeedPlant("Rau muống", "Ipomoea aquatica", "Rau ăn lá",
                    "Vùng nhiệt đới và cận nhiệt đới Cựu Thế giới đến Australia.",
                    "Thân bò hoặc nổi trên nước, rỗng và mọc rễ tại các đốt; lá biến thiên từ mũi tên đến thuôn dài.",
                    "Rau muống là cây thân thảo ưa nơi ẩm, được trồng làm rau ở nhiều nước châu Á.",
                    "Chỉ thu hái từ nguồn nước sạch; rửa kỹ và nấu chín trước khi ăn."),
            new SeedPlant("Cải thìa", "Brassica rapa subsp. chinensis", "Rau ăn lá",
                    "Đông Á; được trồng phổ biến ở nhiều vùng.",
                    "Rau cải thân thấp, bẹ lá trắng hoặc xanh nhạt, phiến lá xanh và nhẵn.",
                    "Cải thìa là rau ăn lá thuộc họ Cải (Brassicaceae), thường thu hoạch cả cây.",
                    "Rửa sạch trước khi chế biến; chọn giống phù hợp mùa vụ địa phương."),
            new SeedPlant("Cà chua", "Solanum lycopersicum", "Rau ăn quả",
                    "Có nguồn gốc ở khu vực Andes Nam Mỹ; được thuần hóa và trồng trên toàn thế giới.",
                    "Cây thân thảo hoặc bán thân gỗ; lá kép có mùi đặc trưng; quả mọng nhiều hình dạng và màu sắc.",
                    "Cà chua thuộc họ Cà (Solanaceae); phần ăn được là quả chín của cây.",
                    "Lá và thân không dùng làm thực phẩm; tránh nhầm quả xanh với quả chín khi chế biến."),
            new SeedPlant("Ớt", "Capsicum annuum", "Rau ăn quả",
                    "Mexico và Trung Mỹ; hiện được trồng rộng khắp.",
                    "Cây bụi thân thảo; hoa nhỏ màu trắng; quả rỗng có nhiều hình dạng, màu sắc và độ cay.",
                    "Ớt thuộc họ Cà; độ cay thay đổi theo giống và không thể suy ra chỉ từ màu quả.",
                    "Capsaicin gây cay và kích ứng; rửa tay sau khi sơ chế, tránh chạm mắt."),
            new SeedPlant("Dưa leo", "Cucumis sativus", "Rau ăn quả",
                    "Nam Á, được trồng từ lâu và phổ biến toàn cầu.",
                    "Dây leo hàng năm có tua cuốn; lá lớn ráp; quả thuôn dài, thường thu hoạch khi còn xanh.",
                    "Dưa leo thuộc họ Bầu bí (Cucurbitaceae), là cây leo cần khoảng trống hoặc giàn đỡ.",
                    "Rửa sạch quả trước khi ăn; kiểm tra giống và độ chín trước khi thu hoạch."),
            new SeedPlant("Tắc (quất)", "Citrus × microcarpa", "Cây ăn quả",
                    "Philippines và khu vực Đông Nam Á lân cận.",
                    "Cây bụi hoặc cây gỗ nhỏ thường xanh; lá có cánh nhỏ ở cuống; quả họ cam quýt nhỏ.",
                    "Tắc (quất) là cây có múi được trồng làm cây ăn quả và cây cảnh chậu.",
                    "Cẩn trọng với gai ở một số cây; rửa quả trước khi dùng.")
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
                    INSERT INTO plant_catalog(id,common_name,scientific_name,category,origin,morphology,overview,toxicity_warning,
                                              publication_status,reviewed_by,reviewed_at)
                    VALUES (?,?,?,?,?,?,?,?,'approved',?,now())
                    """, plantId, plant.commonName(), plant.scientificName(), plant.category(),
                    plant.origin(), plant.morphology(), plant.overview(), plant.toxicityWarning(), reviewerId);
            String sourceUrl = "https://powo.science.kew.org/results?q="
                    + URLEncoder.encode(plant.scientificName(), StandardCharsets.UTF_8);
            jdbc.update("""
                    INSERT INTO plant_catalog_sources(plant_catalog_id,source_title,source_url,supports_fields,added_by)
                    VALUES (?,?,?,?::text[],?)
                    """, plantId, SOURCE_TITLE, sourceUrl, "{common_name,scientific_name,origin,morphology,overview,toxicity_warning}", reviewerId);
        }
    }

    private record SeedPlant(String commonName, String scientificName, String category,
                             String origin, String morphology, String overview, String toxicityWarning) {}
}
