# GoPlant

## Giới thiệu dự án

GoPlant là ứng dụng di động được chuẩn bị bằng Expo, React Native, TypeScript và Expo Router. Repository hiện chứa scaffold Expo Router mặc định làm nền tảng phát triển giao diện; các màn hình sản phẩm GoPlant chưa được triển khai và xác minh trong mã nguồn hiện tại. Cấu hình Expo hiện khai báo tên và slug `GOPLANTT`, còn package có tên `goplantt`.

Theo sơ đồ quy trình `GoPlant.drawio`, phạm vi sản phẩm dự kiến gồm tài khoản và truy cập, khám phá/tìm kiếm cây, quản lý vườn và cây trồng, lập lịch chăm sóc, theo dõi và ghi nhật ký phát triển, cùng một số quy trình quản trị. Đây là mô tả quy trình tham khảo, không phải danh sách chức năng đã hoàn thành. Dự án hiện ở giai đoạn chuẩn bị nền tảng Expo SDK 57 và phát triển frontend.

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Expo SDK | Đã đối chiếu manifest, lockfile và dependency tree: `57.0.31` (khai báo `~57.0.31`) |
| React | Đã đối chiếu: `19.2.3` |
| React Native | Đã đối chiếu: `0.86.3` |
| TypeScript | Dependency tree: `6.0.3` (khai báo `~6.0.3`) |
| Expo Router | Dependency tree: `57.0.29` (khai báo `~57.0.29`) |
| Cài đặt dependencies | Dependency tree hiện có; báo cáo giai đoạn trước ghi `npm install` hoàn tất. Không cài lại trong lần viết README này. |
| Kiểm tra tương thích | `npm ls` được chạy khi viết README và các phiên bản chính khớp. `expo install --check` và Expo Doctor 21/21 là kết quả báo cáo trước đây, chưa chạy lại lần này. |
| Chạy trên Android Emulator | ADB hiện nhận thiết bị `emulator-5554`; chưa xác minh ứng dụng GoPlant mở và chạy trong lần này. Báo cáo thiết lập trước đó ghi chưa chạy thử trên Emulator. |
| Thiết kế kiến trúc | Chưa có bằng chứng đã hoàn thành PHASE 3. Cấu trúc hiện tại vẫn là scaffold template. |

Kết quả kiểm tra ở cột trạng thái được phân biệt theo thời điểm: các phiên bản dependency và kết nối ADB đã được đọc trong lần viết README; kết quả kiểm tra khác được ghi là báo cáo lịch sử.

## Công nghệ sử dụng

Phiên bản trong ngoặc là phiên bản khai báo trong `package.json`; phiên bản cài thực tế được lấy từ `npm ls` và `package-lock.json`.

| Công nghệ | Phiên bản khai báo | Phiên bản đã cài | Vai trò |
|---|---:|---:|---|
| Expo | `~57.0.31` | `57.0.31` | Công cụ và nền tảng ứng dụng Expo |
| React | `19.2.3` | `19.2.3` | Xây dựng giao diện theo component |
| React Native | `0.86.3` | `0.86.3` | Giao diện di động đa nền tảng |
| TypeScript | `~6.0.3` | `6.0.3` | Kiểu tĩnh cho JavaScript |
| Expo Router | `~57.0.29` | `57.0.29` | Điều hướng dựa trên file trong `src/app/` |
| npm | `11.19.1` trên máy đã kiểm tra | Không áp dụng | Cài và quản lý dependency; phiên bản này là kết quả máy phát triển, không khóa phiên bản cho mọi thành viên |

Các package còn lại được liệt kê trong `package.json` và `package-lock.json`; bảng trên chỉ nêu những công nghệ nền tảng chính.

## PHASE 1 — Chuẩn bị môi trường phát triển

Bảng dưới ghi nhận môi trường đã kiểm tra trong phiên viết README. Đây là thông tin máy phát triển tại thời điểm kiểm tra, không phải yêu cầu phiên bản cố định cho mọi máy.

| Công cụ | Vai trò | Trạng thái hoặc ghi chú |
|---|---|---|
| Node.js | Chạy JavaScript và công cụ Expo | Đã kiểm tra: `v24.22.1` |
| npm | Cài dependency | Đã kiểm tra qua `npm.cmd`: `11.19.1`. Trong PowerShell trên máy kiểm tra, `npm` bị chặn bởi chính sách chạy script; dùng `npm.cmd` để gọi npm. |
| Git | Quản lý phiên bản | Đã kiểm tra: `2.56.0.windows.4`; workspace đang ở nhánh `develop2`. |
| Android SDK / ADB | Công cụ Android và kết nối thiết bị | ADB `37.0.1` chạy được; biến `ANDROID_HOME` có giá trị trên máy kiểm tra. |
| Android Emulator / AVD | Chạy ứng dụng Android trong môi trường mô phỏng | ADB hiện nhận một thiết bị Emulator đang trực tuyến. Tên/cấu hình AVD chưa được kiểm tra. |
| Android Studio | Quản lý SDK và AVD, hỗ trợ phát triển Android | Không xác nhận được trạng thái ứng dụng Android Studio trong lần kiểm tra này. |
| Java | Hỗ trợ công cụ build Android khi cần | `java -version` trả về Temurin OpenJDK `17.0.20.1`. `JAVA_HOME` trên máy trỏ tới JDK 25; hai kết quả không trùng nhau. Chưa xác minh cấu hình Gradle/native build đang sử dụng JDK nào. |

Để cài dependency và chạy Metro, cần Node.js cùng npm. Chạy trên Android Emulator cần thêm Android SDK, ADB, Emulator/AVD và quy trình Expo Go phù hợp với SDK. Android Studio là cách thuận tiện để quản lý SDK/AVD; trạng thái cài đặt của nó không được xác nhận tại thời điểm viết tài liệu. JDK/native build không được xem là điều kiện đã xác minh cho quy trình Expo Go hiện tại.

## PHASE 2 — Khởi tạo dự án Expo SDK 57

Quá trình được ghi nhận theo thứ tự:

1. Scaffold Expo ban đầu dùng SDK 58, trước khi dependencies được cài.
2. Scaffold đó được chuyển sang thư mục sao lưu riêng để bảo toàn. Thư mục sao lưu là bản dự phòng, không phải thư mục phát triển chính.
3. Project hiện tại được tạo bằng template được chỉ định tường minh `default@sdk-57`, thay vì template mặc định có thể chọn SDK khác.
4. Dependencies của template được cài bằng npm. Báo cáo thiết lập ghi `npm install` hoàn tất và tạo `package-lock.json`.
5. Phiên bản Expo, React, React Native, Expo Router và TypeScript được đối chiếu với dependency tree khi viết README; chi tiết nằm trong bảng công nghệ.
6. Báo cáo trước ghi `npx expo install --check` trả về dependencies up to date và `npx expo-doctor` đạt 21/21 kiểm tra. Đây là kết quả lịch sử, chưa được chạy lại trong lần cập nhật tài liệu.
7. ADB hiện nhận Emulator, nhưng không có bằng chứng lần này rằng ứng dụng đã được mở thành công. Báo cáo thiết lập trước đó cũng ghi chưa xác minh luồng chạy trên Emulator.

Ứng dụng hiện chưa tích hợp backend, cơ sở dữ liệu, xác thực thật hoặc API. Sơ đồ nghiệp vụ chỉ được dùng để giới thiệu phạm vi sản phẩm dự kiến.

## Cấu trúc thư mục

Cây dưới đây phản ánh các file dự án hiện có, bỏ qua `node_modules/` và dữ liệu sinh tự động trong `.expo/`.

```text
GOPLANTT/
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── assets/
│   ├── expo.icon/
│   │   ├── Assets/
│   │   │   ├── expo-symbol 2.svg
│   │   │   └── grid.png
│   │   └── icon.json
│   └── images/
│       ├── android-icon-background.png
│       ├── android-icon-foreground.png
│       ├── android-icon-monochrome.png
│       ├── expo-badge-white.png
│       ├── expo-badge.png
│       ├── expo-logo.png
│       ├── favicon.png
│       ├── icon.png
│       ├── logo-glow.png
│       ├── react-logo.png
│       ├── react-logo@2x.png
│       ├── react-logo@3x.png
│       ├── splash-icon.png
│       ├── tabIcons/ (home và explore, nhiều mật độ ảnh)
│       └── tutorial-web.png
├── scripts/
│   └── reset-project.js
├── src/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── explore.tsx
│   │   └── index.tsx
│   ├── components/
│   │   ├── ui/collapsible.tsx
│   │   ├── animated-icon.module.css
│   │   ├── animated-icon.tsx
│   │   ├── animated-icon.web.tsx
│   │   ├── app-tabs.tsx
│   │   ├── app-tabs.web.tsx
│   │   ├── external-link.tsx
│   │   ├── hint-row.tsx
│   │   ├── themed-text.tsx
│   │   ├── themed-view.tsx
│   │   └── web-badge.tsx
│   ├── constants/theme.ts
│   ├── hooks/
│   │   ├── use-color-scheme.ts
│   │   ├── use-color-scheme.web.ts
│   │   └── use-theme.ts
│   └── global.css
├── .gitignore
├── AGENTS.md
├── app.json
├── expo-env.d.ts
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
└── tsconfig.json
```

`src/app/` hiện có `_layout.tsx`, `index.tsx` và `explore.tsx`. Các component, hook, theme và hình ảnh hiện diện là nội dung scaffold mẫu; chưa nên xem chúng là giao diện GoPlant đã hoàn tất. Các thư mục `android/` và `ios/` chưa có trong cấu trúc hiện tại; Expo quản lý phần native theo cấu hình và có thể sinh chúng khi quy trình yêu cầu.

## Yêu cầu môi trường

- **Cài dependency và chạy Metro:** Node.js và npm. Nên dùng phiên bản LTS hoặc phiên bản tương thích với công cụ Expo của repository; phiên bản máy kiểm tra không phải ràng buộc chung.
- **Chạy trên Android Emulator:** Android SDK, ADB, một Android Virtual Device (AVD) đã tạo và Emulator đang chạy. Cài/mở Android Studio để quản lý các thành phần này nếu cần.
- **JDK:** Chỉ cần chọn và cấu hình JDK tương thích khi quy trình native/Gradle yêu cầu. JDK mà máy phát triển đang dùng chưa được xác nhận cho một native build của project.

## Cài đặt và chạy trên Windows

### 1. Mở PowerShell tại thư mục dự án

```powershell
cd path\to\GOPLANTT
```

### 2. Cài dependencies

```powershell
npm.cmd install
```

Lệnh dùng `npm.cmd` để tránh PowerShell gọi `npm.ps1`, vốn có thể bị chính sách chạy script chặn trên một số máy.

### 3. Kiểm tra tính tương thích của package Expo

```powershell
npx.cmd expo install --check
```

### 4. Khởi động Android Emulator

Mở Android Studio, vào **Device Manager** và khởi động một AVD đã cấu hình. Có thể kiểm tra kết nối bằng:

```powershell
adb devices
```

Thiết bị cần hiện trạng thái `device`.

### 5. Khởi động ứng dụng phát triển

```powershell
npx.cmd expo start
```

Khi Metro sẵn sàng, nhấn `a` trong cửa sổ terminal để yêu cầu Expo mở ứng dụng trên Emulator. Quy trình này dùng môi trường phát triển Expo/Expo Go tương thích với SDK của dự án; nó không tạo APK để phân phối. Bản build độc lập cần quy trình build riêng.

Dừng Metro bằng `Ctrl + C`. Nếu Expo yêu cầu cài hoặc cập nhật Expo Go trên Emulator, hãy dùng phiên bản tương thích với SDK 57; trạng thái Expo Go trên máy hiện chưa được xác minh.

## Kiểm tra và xác minh

Các lệnh kiểm tra phù hợp với cấu hình hiện tại:

```powershell
npm.cmd ls expo react react-native
npx.cmd expo install --check
npx.cmd expo-doctor
```

Kết quả đã biết:

- Khi viết README, `npm.cmd ls expo react-native expo-router typescript --depth=0` xác nhận các phiên bản chính khớp với manifest và lockfile.
- Báo cáo thiết lập trước đây: `expo install --check` báo dependencies up to date.
- Báo cáo thiết lập trước đây: Expo Doctor đạt 21/21 kiểm tra.
- Chưa có kết quả xác nhận trong lần viết README về việc mở ứng dụng GoPlant trong Emulator.

## Vấn đề đã biết và giới hạn

- Báo cáo cài đặt trước đây ghi `npm audit` phát hiện 5 lỗ hổng mức thấp, 3 mức vừa và 3 mức cao. Đây là kết quả audit tại thời điểm đó, không phải số lượng hiện tại. Không áp dụng sửa tự động vì các đề xuất khi ấy có thể làm thay đổi phiên bản major và ảnh hưởng tương thích SDK 57.
- Trên máy kiểm tra, `npm` trong PowerShell bị chặn do chính sách chạy `npm.ps1`; `npm.cmd` hoạt động. Không cần hạ chính sách bảo mật PowerShell toàn hệ thống.
- `java -version` và `JAVA_HOME` cho thấy hai phiên bản JDK khác nhau trên máy kiểm tra. Chưa xác minh ảnh hưởng đến native build; không có native build nào được xác nhận trong tài liệu này.
- Kết quả Expo Go/Emulator chạy ứng dụng chưa được xác minh. ADB nhận diện Emulator nhưng điều đó tự nó không xác nhận ứng dụng đã mở.

## Quy trình phát triển cơ bản

1. Cài dependencies bằng `npm.cmd install` sau khi lấy mã nguồn.
2. Khởi động Android Emulator nếu phát triển trên Android.
3. Chạy Metro bằng `npx.cmd expo start`.
4. Nhấn `a` để mở ứng dụng trong Emulator bằng Expo Go tương thích.
5. Sau khi thêm hoặc thay đổi package, kiểm tra bằng `npm.cmd ls` và `npx.cmd expo install --check`; chạy Expo Doctor khi cần kiểm tra cấu hình/dependency.
6. Dừng Metro bằng `Ctrl + C`.

Các lệnh này phù hợp với script `start` trong `package.json`. Project cũng khai báo các script `android`, `ios`, `web`, `lint` và `reset-project`; chỉ dùng `reset-project` khi đã xem nội dung script và hiểu thao tác của nó.

## Tiến độ dự án

- [x] Chuẩn bị và kiểm tra một phần môi trường phát triển; tình trạng từng công cụ được ghi ở PHASE 1.
- [x] Tạo project Expo bằng template SDK 57 được chỉ định.
- [x] Cài dependencies theo báo cáo trước và xác nhận lại dependency tree khi viết tài liệu.
- [x] Chạy `expo install --check` và Expo Doctor theo báo cáo trước.
- [ ] Xác nhận lại việc chạy ứng dụng trên Android Emulator.
- [ ] Hoàn thiện kiến trúc dự án (PHASE 3 chưa được xác nhận hoàn thành).
- [ ] Đối chiếu design tokens và màn hình với Figma.
- [ ] Triển khai giao diện GoPlant.
- [ ] Bổ sung kiểm thử tự động khi phù hợp.

## Quy ước bảo trì

Các mục dưới đây là hướng dẫn đề xuất cho quá trình phát triển, không phải quy tắc đã được tự động thực thi trong repository:

- Duy trì tương thích giữa Expo SDK và các package; ưu tiên `npx expo install <package>` khi thêm package có hỗ trợ Expo.
- Kiểm tra ứng dụng sau khi thay đổi dependency hoặc cấu hình.
- Không commit secret, token hoặc API key; lưu thông tin môi trường nhạy cảm ngoài mã nguồn và README.
- Cập nhật README khi cấu trúc hoặc quy trình phát triển thay đổi.


