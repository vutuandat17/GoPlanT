# GoPlant

## Giới thiệu

GoPlant là ứng dụng di động hỗ trợ khám phá và quản lý cây trồng, khu vườn và hoạt động chăm sóc. Phạm vi sản phẩm được tham khảo từ thiết kế Figma và tài liệu chức năng trong repository.

Dự án hiện tập trung vào frontend bằng Expo, React Native, TypeScript và Expo Router. Phase 3 đã xây dựng các màn hình chính; Phase 4 đang hoàn thiện tương tác và state cục bộ để kiểm thử luồng. Chưa có backend, API, database hoặc xác thực production.

## Công nghệ

Phiên bản khai báo lấy từ `package.json`; phiên bản cài đặt được xác nhận bằng `npm ls`.

| Công nghệ | Khai báo | Đã cài | Vai trò |
|---|---:|---:|---|
| Expo | `~57.0.31` | `57.0.31` | Nền tảng và công cụ phát triển |
| React | `19.2.3` | `19.2.3` | Giao diện theo component |
| React Native | `0.86.3` | `0.86.3` | Giao diện di động đa nền tảng |
| Expo Router | `~57.0.29` | `57.0.29` | Điều hướng theo file trong `src/app/` |
| TypeScript | `~6.0.3` | `6.0.3` | Kiểu tĩnh |
| npm | — | `11.19.1` trên môi trường được kiểm tra | Quản lý package; không phải phiên bản bắt buộc cho mọi máy |

Các package khác được liệt kê trong `package.json`, gồm Expo modules, `react-native-reanimated`, `react-native-svg`, `react-native-safe-area-context` và Plus Jakarta Sans.

## Giao diện và trạng thái chức năng

| Khu vực | Trạng thái hiện tại |
|---|---|
| Chào mừng | Màn hình có liên kết đến đăng nhập và đăng ký. |
| Đăng nhập | Mock auth chỉ bật trong development. Đăng nhập admin demo mở `/home`; session được giữ trong bộ nhớ ứng dụng và mất khi khởi động lại. Có thể đăng xuất qua avatar tài khoản. |
| Đăng ký | Có kiểm tra trường bắt buộc, định dạng email/số điện thoại, email khôi phục, độ dài mật khẩu và xác nhận mật khẩu. Tạo tài khoản chưa kết nối dịch vụ và không lưu tài khoản. |
| Trang chủ | Có tìm kiếm, điều hướng tới các khu vực, trạng thái chưa có cây/vườn. Thời tiết được hiển thị là chưa có dữ liệu vì chưa kết nối dịch vụ. Một số nội dung gợi ý vẫn là minh họa. |
| Cây trồng | Có tìm kiếm, yêu thích, lọc, xem chi tiết, thêm, sửa và xóa cây. Hồ sơ và yêu thích là state demo trong RAM; không được lưu bền vững. Xóa có bước xác nhận. |
| Thư viện và chi tiết cây | Có danh mục mẫu 5 cây Trầu bà. Hiện chỉ có tên, tên khoa học và loại cây; các điều kiện sinh trưởng chưa có dữ liệu nguồn nên hiển thị là chưa có dữ liệu. |
| Khu vườn | Có danh sách, chi tiết và biểu mẫu. Tạo/lưu khu vườn chưa được triển khai; nội dung chi tiết dùng dữ liệu giao diện mẫu. |
| Nhật ký và lịch chăm sóc | Có danh sách/chi tiết và biểu mẫu tương ứng. Dữ liệu là mẫu; form chưa lưu hoặc đồng bộ backend. Camera chưa được bật. |
| Theo dõi | Có màn hình tổng quan/chi tiết. Chỉ số, lịch sử và trạng thái cảm biến hiện hiển thị rỗng/chưa có dữ liệu; chưa kết nối nguồn theo dõi thật. |

Tài khoản mock để kiểm thử giao diện:

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@goplant.test` | `Admin123!` | `admin` |

Thông tin trên được khai báo trong `src/services/mockAuth.ts`, chỉ dùng cho demo development. Đây không phải xác thực bảo mật; không dùng cho production.

### State và dữ liệu

- `AuthSessionProvider` giữ user hiện tại trong RAM. Đăng xuất xóa session frontend; không có token hoặc mật khẩu được lưu trong persistent storage.
- `PlantDataProvider` giữ cây và danh sách yêu thích trong RAM. Dữ liệu được chia sẻ giữa các route trong cùng phiên và mất khi ứng dụng khởi động lại.
- Mock data trên các màn hình vườn, nhật ký và lịch chỉ phục vụ trình bày. Không xem các nội dung đó là dữ liệu người dùng đã được lưu.
- Không có số liệu cảm biến, ngưỡng chăm sóc, cảnh báo hoặc kết luận sức khỏe cây thực tế.

## Route

Các route nằm trong `src/app/`:

```text
/
├── /auth/login
├── /auth/register
├── /home
├── /gardens
├── /garden/create
├── /garden-detail
├── /plants
├── /garden/add-plant
├── /plant-detail
├── /search
├── /filter
├── /journal
├── /journal/new
├── /journal/edit
├── /journal/detail
├── /schedule
├── /schedule/create
├── /schedule/detail
├── /monitoring
├── /monitoring/detail
└── /explore (màn hình mẫu Expo)
```

Có route không đồng nghĩa toàn bộ nghiệp vụ phía sau đã hoạt động hoặc có dữ liệu thật.

## Cấu trúc dự án

```text
GOPLANTT/
├── assets/                  # Hình ảnh, font và asset giao diện
├── design-reference/        # Ảnh tham chiếu xuất từ Figma
├── src/
│   ├── app/                  # Route Expo Router
│   ├── components/           # Component dùng chung và component mẫu
│   ├── constants/            # Theme và design tokens
│   ├── features/             # UI theo nhóm chức năng
│   ├── hooks/                # Hook dùng chung
│   ├── services/             # Mock authentication
│   └── types/                # Khai báo kiểu bổ sung
├── scripts/
├── app.json
├── package.json
├── package-lock.json
└── tsconfig.json
```

Thư mục `android/` và `ios/` chưa được commit. Expo quản lý native project theo cấu hình và workflow được chọn.

## Cài đặt và chạy trên Windows

Yêu cầu cơ bản là Node.js và npm. Để chạy trên Android cần thêm Android SDK, ADB, Android Emulator và một AVD đã tạo. Android Studio có thể dùng để quản lý SDK/AVD.

### 1. Mở PowerShell tại thư mục dự án

```powershell
cd path\to\GOPLANTT
```

### 2. Cài dependency theo lockfile

```powershell
npm.cmd ci
```

### 3. Khởi động Android Emulator

Mở AVD từ Android Studio Device Manager. Có thể kiểm tra kết nối bằng:

```powershell
adb devices
```

### 4. Khởi chạy Expo/Metro

```powershell
npx.cmd expo start
```

Khi Metro sẵn sàng, nhấn `a` để yêu cầu Expo mở ứng dụng trong Emulator. Đây là quy trình phát triển, không tạo APK. Dùng Expo Go tương thích SDK 57 nếu workflow đó đáp ứng các native module đang dùng. Dừng Metro bằng `Ctrl + C`.

Trong PowerShell, dùng `npm.cmd`/`npx.cmd` nếu lệnh không có hậu tố bị chặn bởi Execution Policy.

## Kiểm tra

```powershell
npm.cmd ls expo react react-native expo-router typescript --depth=0
npx.cmd tsc --noEmit
npx.cmd expo install --check
npx.cmd expo-doctor
```

Kết quả kiểm tra trong Phase 4:

- `npm.cmd ls ... --depth=0`: các phiên bản chính hiện diện đúng như bảng công nghệ.
- `npx.cmd tsc --noEmit`: đạt.
- `npx.cmd expo install --check`: cảnh báo 5 package thấp hơn bản vá Expo khuyến nghị: `expo` (`57.0.31`, mong đợi `~57.0.32`), `expo-constants` (`57.0.22`, mong đợi `~57.0.23`), `expo-glass-effect` (`57.0.4`, mong đợi `~57.0.5`), `expo-router` (`57.0.29`, mong đợi `~57.0.30`) và `expo-splash-screen` (`57.0.10`, mong đợi `~57.0.11`). Chưa cập nhật package trong Phase 4.
- `npx.cmd expo-doctor`: 20/21 kiểm tra đạt; kiểm tra phiên bản package thất bại do cùng 5 bản vá trên.
- `npm.cmd run lint`: chưa chạy vì script hiện cố tự tạo cấu hình ESLint khi chưa có cấu hình. Không chấp nhận tạo cấu hình trong phạm vi này.
- Android Emulator: không khởi chạy trong Phase 4; chưa xác minh giao diện trực tiếp trên thiết bị.

## Giới hạn và công việc tiếp theo

- [x] Màn hình frontend chính và điều hướng theo route hiện có.
- [x] Mock login admin trong development, session RAM và thao tác đăng xuất.
- [x] Kiểm tra frontend đăng ký; chưa tạo tài khoản thật.
- [x] Thao tác cây cục bộ: thêm, xem, sửa, xóa, tìm kiếm và yêu thích.
- [x] Đánh dấu rõ dữ liệu môi trường/theo dõi chưa có nguồn.
- [ ] Thêm nguồn dữ liệu có căn cứ cho thư viện và điều kiện sinh trưởng cây.
- [ ] Hoàn thiện lưu trữ/nghiệp vụ vườn, nhật ký, lịch chăm sóc và theo dõi.
- [ ] Tích hợp backend, API, database và xác thực thật theo yêu cầu giai đoạn sau.
- [ ] Kiểm tra UI trên Android Emulator và đối chiếu với Figma.
- [ ] Thiết lập ESLint nếu nhóm cần dùng script lint.

## Bảo trì

- Giữ tương thích giữa Expo SDK và các package; ưu tiên `npx expo install <package>` khi thêm package được Expo hỗ trợ.
- Chạy lại TypeScript và kiểm tra Expo sau khi thay đổi dependency hoặc cấu hình.
- Không commit secret, token hoặc API key. Tài khoản mock trong source chỉ dùng demo, không dùng production.
- Cập nhật README khi route, quy trình hoặc trạng thái chức năng thay đổi.
