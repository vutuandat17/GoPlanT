# GoPlant

## Giới thiệu

GoPlant là ứng dụng di động hỗ trợ khám phá và quản lý cây trồng, khu vườn và hoạt động chăm sóc. Phạm vi sản phẩm được tham khảo từ thiết kế Figma và tài liệu chức năng trong repository.

Dự án hiện tập trung vào frontend bằng Expo, React Native, TypeScript và Expo Router. Phase 3 đã xây dựng các màn hình chính; Phase 4 hoàn thiện một số tương tác, xác thực mock và state cục bộ để kiểm thử luồng. Các thay đổi gần đây cũng đã gỡ conflict markers và khôi phục bundling Web. Chưa có backend, API, database hoặc xác thực production.

## Công nghệ

Phiên bản khai báo lấy từ `package.json`; phiên bản cài đặt được xác nhận bằng `npm ls`.

| Công nghệ | Khai báo | Đã cài | Vai trò |
|---|---:|---:|---|
| Expo | `~57.0.32` | `57.0.32` | Nền tảng và công cụ phát triển |
| React | `19.2.3` | `19.2.3` | Giao diện theo component |
| React Native | `0.86.3` | `0.86.3` | Giao diện di động đa nền tảng |
| Expo Router | `~57.0.30` | `57.0.30` | Điều hướng theo file trong `src/app/` |
| TypeScript | `~6.0.3` | `6.0.3` | Kiểu tĩnh |
| npm | — | `11.19.1` trên môi trường được kiểm tra | Quản lý package; không phải phiên bản bắt buộc cho mọi máy |

Các package khác được liệt kê trong `package.json`, gồm Expo modules, `react-native-reanimated`, `react-native-svg`, `react-native-safe-area-context` và Plus Jakarta Sans.

## Giao diện và trạng thái chức năng

| Khu vực | Trạng thái hiện tại |
|---|---|
| Chào mừng | Màn hình có liên kết đến đăng nhập và đăng ký. |
| Đăng nhập | Mock auth chỉ bật trong development. Đăng nhập admin demo mở `/home`; session được giữ trong bộ nhớ ứng dụng và mất khi khởi động lại. Có thể mở khu vực tài khoản từ avatar và đăng xuất sau bước xác nhận. |
| Đăng ký | Có kiểm tra trường bắt buộc, định dạng email/số điện thoại, email khôi phục, độ dài mật khẩu và xác nhận mật khẩu. Tạo tài khoản chưa kết nối dịch vụ và không lưu tài khoản. |
| Trang chủ | Có tìm kiếm, điều hướng tới các khu vực, trạng thái chưa có cây/vườn. Thời tiết được hiển thị là chưa có dữ liệu vì chưa kết nối dịch vụ. Một số nội dung gợi ý vẫn là minh họa. |
| Cây trồng | Có tìm kiếm, yêu thích, lọc, xem chi tiết, thêm, sửa và xóa cây. Hồ sơ và yêu thích là state demo trong RAM; không được lưu bền vững. Xóa có bước xác nhận. |
| Thư viện và chi tiết cây | Có danh mục mẫu 5 cây Trầu bà. Hiện chỉ có tên, tên khoa học và loại cây; các điều kiện sinh trưởng chưa có dữ liệu nguồn nên hiển thị là chưa có dữ liệu. |
| Khu vườn | Có danh sách, chi tiết và biểu mẫu. Tạo/lưu khu vườn chưa được triển khai; nội dung chi tiết dùng dữ liệu giao diện mẫu. |
| Nhật ký và lịch chăm sóc | Có danh sách/chi tiết và biểu mẫu tương ứng. Dữ liệu là mẫu; form chưa lưu hoặc đồng bộ backend. Camera chưa được bật. |
| Theo dõi | Có màn hình tổng quan/chi tiết. Chỉ số, lịch sử và trạng thái cảm biến hiện hiển thị rỗng/chưa có dữ liệu; chưa kết nối nguồn theo dõi thật. |
| Quản lý tài khoản | Có trang tổng quan cùng các màn hình hồ sơ, thông tin đăng nhập, bảo mật, thông báo, cài đặt và quyền riêng tư. Các tác vụ cần backend hoặc dịch vụ hệ thống được ghi rõ là chưa kết nối. |

## Mục tiêu sản phẩm
GoPlant là ứng dụng di động hỗ trợ người dùng khám phá và quản lý cây trồng, khu vườn cùng các hoạt động chăm sóc. Phạm vi sản phẩm được thể hiện trong thiết kế Figma và tài liệu chức năng của dự án.

Repository hiện có giao diện frontend React Native theo Expo SDK 57, được tổ chức bằng Expo Router và TypeScript. Phase 3 đã bổ sung các màn hình và luồng frontend chính; Phase 4 hoàn thiện một số tương tác và state cục bộ. Nhiều phần vẫn dùng dữ liệu minh họa hoặc chưa kết nối dịch vụ. Ứng dụng chưa có backend, cơ sở dữ liệu hay xác thực thật.

## Trạng thái công nghệ

Phiên bản khai báo lấy từ `package.json`; phiên bản cài đặt được xác nhận bằng `npm ls` tại thời điểm cập nhật README.

| Công nghệ | Khai báo | Đã cài | Vai trò |
|---|---:|---:|---|
| Expo | `~57.0.32` | `57.0.32` | Nền tảng và công cụ phát triển ứng dụng |
| React | `19.2.3` | `19.2.3` | Xây dựng giao diện theo component |
| React Native | `0.86.3` | `0.86.3` | Giao diện di động đa nền tảng |
| TypeScript | `~6.0.3` | `6.0.3` | Kiểu tĩnh cho mã JavaScript |
| Expo Router | `~57.0.30` | `57.0.30` | Điều hướng theo file trong `src/app/` |
| npm | — | `11.19.1` trên môi trường kiểm tra | Quản lý package; đây không phải phiên bản khóa cho mọi máy |

Các package khác được khai báo trong `package.json`, gồm Expo modules, `react-native-reanimated`, `react-native-svg`, `react-native-safe-area-context` và font Plus Jakarta Sans.

## Giao diện và chức năng hiện có

| Khu vực | Trạng thái trong frontend |
|---|---|
| Chào mừng | Có giao diện và liên kết đến đăng nhập, đăng ký. |
| Đăng nhập | Có mock authentication trong môi trường development (`__DEV__`). Tài khoản demo hợp lệ đưa người dùng đến `/home`; đây không phải xác thực bảo mật và không dùng cho production. Session nằm trong RAM, có thể mất khi khởi động lại. |
| Đăng ký | Có biểu mẫu, kiểm tra trường nhập và thông báo lỗi. Tạo tài khoản chưa kết nối backend và không lưu tài khoản. |
| Trang chủ | Có ô tìm kiếm, phím tắt, trạng thái vườn/cây rỗng và nội dung gợi ý. Một số thẻ như thời tiết, lời chào và gợi ý cây là dữ liệu giao diện mẫu. |
| Quản lý cây | Có tìm kiếm, trạng thái rỗng, danh sách cây, yêu thích và thao tác thêm/xem/sửa/xóa frontend. Hồ sơ và yêu thích được giữ trong bộ nhớ ứng dụng trong phiên, không lưu bền vững. |
| Tìm kiếm và bộ lọc | Tìm theo tên trong dữ liệu cục bộ; có nhóm bộ lọc và kết quả tính từ danh mục hiện có. Danh mục hiện chỉ có một số cây mẫu, phần lớn thuộc tính sinh trưởng còn thiếu. |
| Chi tiết cây | Có các khu vực thông tin cơ bản, đặc điểm và điều kiện sinh trưởng. Trường chưa có nguồn dữ liệu hiển thị “Chưa có dữ liệu”; chưa có số đo cảm biến hoặc ngưỡng sức khỏe thực. |
| Quản lý vườn | Có màn hình danh sách, chi tiết và biểu mẫu tạo vườn. Dữ liệu vườn và một số thao tác chỉ phục vụ xem trước, chưa được lưu. |
| Nhật ký | Có danh sách, chi tiết và biểu mẫu nhập/chỉnh sửa. Nội dung là mẫu; biểu mẫu chưa lưu nhật ký vào backend. Camera được hoãn. |
| Lịch chăm sóc | Có danh sách, chi tiết và biểu mẫu tạo lịch. Kiểm tra nhập liệu ở frontend; lịch chưa được lưu và chưa đồng bộ thông báo. |
| Theo dõi | Có giao diện tổng quan và chi tiết. Chưa kết nối cảm biến hoặc nguồn dữ liệu sức khỏe; nội dung hiển thị có thể là dữ liệu mẫu. |
| Quản lý tài khoản | Có trang tổng quan và sáu route con cho hồ sơ, thông tin đăng nhập, bảo mật, thông báo, cài đặt và quyền riêng tư. Tùy chọn thay đổi chỉ phục vụ demo; các tác vụ cần backend/API chưa thực hiện. |

Tài khoản mock development được khai báo trong `src/services/mockAuth.ts`:

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@goplant.test` | `Admin123!` | `admin` |

Thông tin trên được khai báo trong `src/services/mockAuth.ts`, chỉ dùng cho demo development. Đây không phải xác thực bảo mật; không dùng cho production.

### State và dữ liệu

- `AuthSessionProvider` giữ user hiện tại trong RAM. Đăng xuất xóa session frontend; không có token hoặc mật khẩu được lưu trong persistent storage.
- `PlantDataProvider` giữ cây và danh sách yêu thích trong RAM. Dữ liệu được chia sẻ giữa các route trong cùng phiên và mất khi ứng dụng khởi động lại.
- Hồ sơ cây thiếu hoặc đã bị xóa sẽ hiển thị trạng thái dự phòng thay vì giả định rằng bản ghi vẫn tồn tại.
- Mock data trên các màn hình vườn, nhật ký và lịch chỉ phục vụ trình bày. Không xem các nội dung đó là dữ liệu người dùng đã được lưu.
- Không có số liệu cảm biến, ngưỡng chăm sóc, cảnh báo hoặc kết luận sức khỏe cây thực tế.

### Phase 4 — Frontend Functionality and Data Integration Preparation

- Mock login chỉ bật trong development; session được giữ trong RAM và đăng xuất yêu cầu xác nhận.
- Biểu mẫu đăng ký kiểm tra trường bắt buộc, định dạng email/số điện thoại, email khôi phục, mật khẩu và xác nhận mật khẩu. Tạo tài khoản thật chưa được hỗ trợ.
- Quản lý hồ sơ cây và yêu thích hoạt động cục bộ trong phiên; không có lưu trữ bền vững.
- Thời tiết, dữ liệu sức khỏe cây và biểu đồ theo dõi thể hiện trạng thái chưa có dữ liệu khi chưa có nguồn thật.
- Biểu mẫu vườn, nhật ký và lịch chăm sóc chưa ghi dữ liệu lên backend.

Phase 4 tập trung vào frontend và chuẩn bị tích hợp dữ liệu; không bao gồm backend, API, database hoặc xác thực production.

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
├── /account
├── /account/profile
├── /account/credentials
├── /account/security
├── /account/notifications
├── /account/settings
├── /account/privacy
└── /explore (màn hình mẫu Expo)
```

Có route không đồng nghĩa toàn bộ nghiệp vụ phía sau đã hoạt động hoặc có dữ liệu thật.
Thông tin này chỉ dùng để thử giao diện trong development. Không dùng làm thông tin xác thực thật hoặc trong bản production. Tắt mock auth không thay thế cho một hệ thống xác thực an toàn.

### Thông tin cây và dữ liệu

Mô hình hồ sơ có chỗ cho tên cây, tên khoa học, loại cây, vị trí, ngày trồng, ghi chú, điều kiện sinh trưởng và một số đặc tính tham khảo. Danh mục hiện có năm mục Trầu bà với tên thường gọi, tên khoa học và loại cây; các trường sinh trưởng khác chưa được cung cấp.

Hồ sơ cây do người dùng thêm và danh sách yêu thích chỉ lưu trong state của ứng dụng. Chúng mất khi ứng dụng khởi động lại. Các màn hình sức khỏe, chỉ số môi trường, lịch sử đo đạc, cảnh báo và nhật ký chưa có dữ liệu thật hoặc đồng bộ backend.

## Điều hướng

Các route được đặt dưới `src/app/`:

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
├── /account
├── /account/profile
├── /account/credentials
├── /account/security
├── /account/notifications
├── /account/settings
├── /account/privacy
└── /explore (màn hình mẫu Expo còn trong project)
```

Các route chi tiết nhận tham số qua Expo Router khi cần. Sự tồn tại của route không đồng nghĩa toàn bộ nghiệp vụ phía sau đã được triển khai.

## Cấu trúc dự án

```text
GOPLANTT/
├── assets/                  # Hình ảnh, font và asset giao diện
├── design-reference/        # Ảnh tham chiếu xuất từ Figma
├── src/
│   ├── app/                  # Route Expo Router
│   ├── components/           # Component dùng chung và component mẫu
│   ├── constants/            # Theme và design tokens
│   ├── features/             # UI theo nhóm chức năng, gồm account và auth
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
```text
├── assets/
│   ├── images/                 # Asset ứng dụng và ảnh xuất từ thiết kế
│   └── images/figma/            # Một số asset Figma được dùng trong giao diện
├── design-reference/           # Ảnh tham chiếu các màn hình Figma
├── src/
│   ├── app/                     # Route Expo Router
│   ├── components/              # Component dùng chung và component mẫu Expo
│   ├── constants/theme.ts       # Token màu và kiểu chữ
│   ├── features/                # Giao diện theo nhóm chức năng
│   │   └── account/             # Màn hình quản lý tài khoản
│   ├── hooks/                   # Hook dùng chung và hỗ trợ theme
│   ├── services/                # Mock authentication
│   ├── types/                   # Khai báo kiểu bổ sung
│   └── global.css
├── scripts/                     # Script hỗ trợ project
├── app.json                     # Cấu hình Expo
├── package.json                 # Package và script
├── package-lock.json            # Lockfile npm
└── tsconfig.json                # Cấu hình TypeScript
```

Thư mục `android/` và `ios/` hiện không có trong repository. Expo có thể sinh native project theo quy trình cần thiết; không tạo hoặc chỉnh các thư mục này thủ công trong workflow Expo hiện tại.

## Yêu cầu môi trường

### Cài dependencies và chạy Metro

- Node.js và npm.
- Phiên bản đã kiểm tra trong môi trường cập nhật README: Node.js `v24.22.1`, npm `11.19.1`. Project không khai báo trường `engines`, vì vậy đây là phiên bản môi trường kiểm tra, không phải giới hạn bắt buộc cho tất cả máy.

### Chạy trên Android Emulator

- Android SDK, ADB và Android Emulator.
- Một AVD đã được tạo và khởi chạy.
- Android Studio là công cụ để cài đặt/quản lý SDK và AVD. Trạng thái cài trên từng máy cần tự kiểm tra.
- JDK/native build chỉ cần cấu hình phù hợp nếu sử dụng workflow native hoặc Gradle; project hiện chưa có native folders được commit.

## Cài đặt và chạy trên Windows

Yêu cầu cơ bản là Node.js và npm. Để chạy trên Android cần thêm Android SDK, ADB, Android Emulator và một AVD đã tạo. Android Studio có thể dùng để quản lý SDK/AVD.

### 1. Mở PowerShell tại thư mục dự án

```powershell
cd path\to\GOPLANTT
```

### 2. Cài dependency theo lockfile
### 2. Cài đúng dependency theo lockfile

```powershell
npm.cmd ci
```

### 3. Khởi động Android Emulator

Mở AVD từ Android Studio Device Manager. Có thể kiểm tra kết nối bằng:
Mở Android Studio, vào **Device Manager** và khởi chạy AVD. Có thể kiểm tra thiết bị bằng:

```powershell
adb devices
```

Emulator cần xuất hiện với trạng thái `device`.

### 4. Khởi chạy Expo/Metro

```powershell
npx.cmd expo start
```

Khi Metro sẵn sàng, nhấn `a` để yêu cầu Expo mở ứng dụng trong Emulator. Đây là quy trình phát triển, không tạo APK. Dùng Expo Go tương thích SDK 57 nếu workflow đó đáp ứng các native module đang dùng. Dừng Metro bằng `Ctrl + C`.

Trong PowerShell, dùng `npm.cmd`/`npx.cmd` nếu lệnh không có hậu tố bị chặn bởi Execution Policy.

### 5. Chạy trên Expo Web

```powershell
npx.cmd expo start --web --clear
```

Expo Web dùng Metro để tạo bundle cho trình duyệt. Lệnh này khởi chạy môi trường phát triển, không tạo gói phân phối.

## Kiểm tra
Khi Metro sẵn sàng, nhấn `a` trong terminal để yêu cầu Expo mở ứng dụng trên Android Emulator. Quy trình này chạy ứng dụng trong môi trường phát triển, thường qua Expo Go tương thích; `expo start` không tạo APK. Nếu cần native module không có trong Expo Go thì cần đánh giá development build riêng.

Dừng Metro bằng `Ctrl + C`. Trên PowerShell, dùng `npm.cmd`/`npx.cmd` nếu lệnh không hậu tố bị Execution Policy chặn.

## Kiểm tra

Các lệnh phù hợp với project:

```powershell
npm.cmd ls expo react react-native expo-router typescript --depth=0
npx.cmd tsc --noEmit
npx.cmd expo install --check
npx.cmd expo-doctor
```

Kết quả kiểm tra được ghi nhận trong Phase 4 và lần sửa bundling Web gần đây:

- `npm.cmd ls expo react react-native expo-router typescript --depth=0`: đã xác minh Expo `57.0.32`, React `19.2.3`, React Native `0.86.3`, Expo Router `57.0.30` và TypeScript `6.0.3`.
- `npx.cmd tsc --noEmit`: đạt trong lần kiểm tra sau khi sửa conflict markers.
- `npx.cmd expo install --check`: lần kiểm tra gần nhất báo dependencies up to date.
- `npx.cmd expo-doctor`: lần kiểm tra gần nhất được báo cáo đạt 21/21. Kết quả 20/21 ở lần kiểm tra Phase 4 đầu tiên là lịch sử; khi đó có 5 package chưa ở bản vá khuyến nghị. Các bản khai báo hiện tại đã khớp và Expo install check sau đó đạt.
- Expo Web: conflict markers đã được gỡ trong `MainScreens.tsx`, `HomeScreen.tsx` và `_layout.tsx`; `app-top-bar.tsx` dùng lại `AccountButton`. Metro ghi nhận `Web Bundled`; trang và bundle endpoint trả HTTP 200. Lần chạy dùng cổng 8082 do cổng 8081 đã có tiến trình khác. Cảnh báo `spawn EPERM` khi khởi chạy React Native DevTools không ngăn bundling.
- Kiểm thử tương tác trong trình duyệt: chưa thực hiện được vì công cụ điều khiển UI không kết nối. Android Emulator cũng chưa được khởi chạy; chưa xác minh trực quan trên Android.
- `npm.cmd run lint`: chưa chạy vì script hiện cố tự tạo cấu hình ESLint khi chưa có cấu hình. Không chấp nhận tạo cấu hình trong phạm vi này.

## Giới hạn và công việc tiếp theo

- [x] Màn hình frontend chính và điều hướng theo route hiện có.
- [x] Mock login admin trong development, session RAM và thao tác đăng xuất.
- [x] Kiểm tra frontend đăng ký; chưa tạo tài khoản thật.
- [x] Thao tác cây cục bộ: thêm, xem, sửa, xóa, tìm kiếm và yêu thích.
- [x] Đánh dấu rõ dữ liệu môi trường/theo dõi chưa có nguồn.
- [x] Sửa conflict markers và xác minh Expo Web bundling.
- [x] Bổ sung giao diện quản lý tài khoản theo các route hiện có trong repository.
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
Kết quả lịch sử từ lần cập nhật README trước (các phiên bản dưới đây đã được thay thế bởi trạng thái hiện tại ở phần trên):

- `npm.cmd ls expo react-native expo-router typescript --depth=0`: khi đó các package chính hiện diện với Expo `57.0.31`, React `19.2.3`, React Native `0.86.3`, Expo Router `57.0.29` và TypeScript `6.0.3`.
- `npx.cmd tsc --noEmit`: hoàn tất thành công.
- `npm.cmd run lint`: chưa chạy được. Script `expo lint` của project cố tự tạo cấu hình ESLint; lệnh đã được dừng để tránh sửa cấu hình ngoài phạm vi README.
- `expo install --check` và Expo Doctor 21/21: kết quả đã được báo cáo ở lần kiểm tra Phase 3 trước đó, không chạy lại trong nhiệm vụ README này.
- Android Emulator: không khởi chạy hoặc kiểm thử UI trong nhiệm vụ này.

## Giới hạn hiện tại và tiến độ

- [x] Khởi tạo frontend bằng Expo SDK 57, React Native và TypeScript.
- [x] Bổ sung các route UI chính cho chào mừng, đăng nhập/đăng ký, trang chủ, cây trồng, vườn, tìm kiếm, nhật ký, lịch và theo dõi.
- [x] Bổ sung mock login development và quản lý cây cục bộ trong phiên.
- [x] Hoàn thành các tương tác frontend đã xác định trong Phase 4; không bao gồm backend hoặc xác thực production.
- [x] Gỡ conflict markers và xác minh bundle Expo Web trả về HTTP 200.
- [x] Chạy TypeScript và kiểm tra dependency chính khi cập nhật tài liệu.
- [x] Khôi phục bundling Expo Web sau khi xử lý conflict markers.
- [ ] Kiểm thử tương tác toàn luồng trên Web và Android Emulator.
- [ ] Hoàn thiện dữ liệu nội dung cây, gồm điều kiện sinh trưởng có nguồn xác định.
- [ ] Kết nối lưu trữ/backend/API và xác thực thật.
- [ ] Hoàn thiện các nghiệp vụ vườn, nhật ký, lịch chăm sóc và theo dõi.
- [ ] Đối chiếu toàn bộ giao diện trực tiếp trên Android Emulator với ảnh Figma.
- [ ] Thiết lập ESLint riêng nếu nhóm muốn dùng script lint hiện tại.

Các mục đánh dấu hoàn thành chỉ mô tả phần frontend hoặc kiểm tra đã có bằng chứng; chúng không đồng nghĩa với backend hoặc kiểm thử UI trên thiết bị.

## Bảo trì

Các mục sau là hướng dẫn phát triển:

- Giữ phiên bản package tương thích với Expo SDK đang dùng; ưu tiên `npx expo install <package>` cho package có hỗ trợ Expo.
- Chạy lại kiểm tra TypeScript và tương thích sau khi thay đổi dependency hoặc cấu hình.
- Không commit secret, token hoặc API key. Tài khoản mock trong source không phải bí mật và không được dùng cho production.
- Cập nhật README khi route, quy trình chạy hoặc phạm vi chức năng thay đổi.
