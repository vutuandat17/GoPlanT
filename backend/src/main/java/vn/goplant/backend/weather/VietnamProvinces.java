package vn.goplant.backend.weather;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The 34 provincial-level units of Vietnam (effective 2025-07-01) with the coordinates of each
 * administrative center. Coordinates were taken from the OpenWeatherMap Geocoding API so that a
 * garden located "by province" is looked up at the provincial center.
 */
public final class VietnamProvinces {

    public record Province(String code, String name, String center, double latitude, double longitude) {}

    public static final List<Province> ALL = List.of(
            new Province("ha-noi", "Hà Nội", "Hà Nội", 21.0283, 105.8540),
            new Province("ho-chi-minh", "TP. Hồ Chí Minh", "TP. Hồ Chí Minh", 10.7764, 106.7011),
            new Province("hai-phong", "Hải Phòng", "Hải Phòng", 20.8816, 106.6790),
            new Province("da-nang", "Đà Nẵng", "Đà Nẵng", 16.0680, 108.2120),
            new Province("can-tho", "Cần Thơ", "Cần Thơ", 10.0365, 105.7876),
            new Province("hue", "Huế", "Huế", 16.4639, 107.5863),
            new Province("an-giang", "An Giang", "Rạch Giá", 10.0107, 105.0833),
            new Province("bac-ninh", "Bắc Ninh", "Bắc Giang", 21.2816, 106.1989),
            new Province("ca-mau", "Cà Mau", "Cà Mau", 9.1782, 105.1520),
            new Province("cao-bang", "Cao Bằng", "Cao Bằng", 22.6658, 106.2588),
            new Province("dak-lak", "Đắk Lắk", "Buôn Ma Thuột", 12.6797, 108.0447),
            new Province("dien-bien", "Điện Biên", "Điện Biên Phủ", 21.3875, 103.0185),
            new Province("dong-nai", "Đồng Nai", "Biên Hòa", 10.9510, 106.8226),
            new Province("dong-thap", "Đồng Tháp", "Mỹ Tho", 10.3606, 106.3658),
            new Province("gia-lai", "Gia Lai", "Quy Nhơn", 13.7696, 109.2315),
            new Province("ha-tinh", "Hà Tĩnh", "Hà Tĩnh", 18.3420, 105.9057),
            new Province("hung-yen", "Hưng Yên", "Hưng Yên", 20.6568, 106.0540),
            new Province("khanh-hoa", "Khánh Hòa", "Nha Trang", 12.2432, 109.1899),
            new Province("lai-chau", "Lai Châu", "Lai Châu", 22.3997, 103.4517),
            new Province("lam-dong", "Lâm Đồng", "Đà Lạt", 11.9402, 108.4376),
            new Province("lang-son", "Lạng Sơn", "Lạng Sơn", 21.8529, 106.7597),
            new Province("lao-cai", "Lào Cai", "Yên Bái", 21.6961, 104.8752),
            new Province("nghe-an", "Nghệ An", "Vinh", 18.6699, 105.6840),
            new Province("ninh-binh", "Ninh Bình", "Hoa Lư", 20.2545, 105.9765),
            new Province("phu-tho", "Phú Thọ", "Việt Trì", 21.3136, 105.3946),
            new Province("quang-ngai", "Quảng Ngãi", "Quảng Ngãi", 15.1190, 108.8096),
            new Province("quang-ninh", "Quảng Ninh", "Hạ Long", 20.9528, 107.0800),
            new Province("quang-tri", "Quảng Trị", "Đồng Hới", 17.4660, 106.5985),
            new Province("son-la", "Sơn La", "Sơn La", 21.3274, 103.9152),
            new Province("tay-ninh", "Tây Ninh", "Tân An", 10.5365, 106.4099),
            new Province("thai-nguyen", "Thái Nguyên", "Thái Nguyên", 21.5925, 105.8435),
            new Province("thanh-hoa", "Thanh Hóa", "Thanh Hóa", 19.8077, 105.7767),
            new Province("tuyen-quang", "Tuyên Quang", "Tuyên Quang", 21.7880, 105.2174),
            new Province("vinh-long", "Vĩnh Long", "Vĩnh Long", 10.2520, 105.9736));

    private static final Map<String, Province> BY_CODE = ALL.stream()
            .collect(Collectors.toUnmodifiableMap(Province::code, Function.identity()));

    private VietnamProvinces() {}

    public static Optional<Province> find(String code) {
        return code == null ? Optional.empty() : Optional.ofNullable(BY_CODE.get(code));
    }
}
