# GoPlant

GoPlant gồm ứng dụng Expo/React Native trong [`GOPLANTT/`](GOPLANTT/README.md) và REST API Spring Boot trong [`backend/`](backend/README.md). Backend dùng PostgreSQL để lưu tài khoản, danh mục cây, khu vườn, cây của người dùng và yêu thích.

## Yêu cầu

- JDK 21
- Maven 3.9 trở lên
- Node.js và npm
- Docker Desktop đang chạy
- Android Studio Emulator hoặc thiết bị Android

## Chạy PostgreSQL và backend

Khởi động Docker Desktop. Dự án dùng PostgreSQL trong Docker. Nếu bạn cũng đã cài PostgreSQL trực tiếp trên Windows, hãy chỉ để một dịch vụ dùng cổng `5432`. Có thể kiểm tra nhanh bằng `docker compose ps` và `Get-Service postgresql-x64-17`. Nếu chọn Docker, dừng dịch vụ PostgreSQL Windows trong PowerShell chạy với quyền quản trị:

```powershell
Stop-Service postgresql-x64-17
```

Mở PowerShell thứ nhất tại thư mục gốc dự án:

```powershell
cd .\backend
docker compose up -d postgres
docker compose ps

# Lấy mật khẩu đã cấu hình trong container mà không in mật khẩu ra màn hình.
$containerId = docker compose ps -q postgres
if (-not $containerId) { throw 'Không tìm thấy container PostgreSQL.' }
$pgPasswordSetting = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $containerId | Select-String '^POSTGRES_PASSWORD='
if (-not $pgPasswordSetting) { throw 'Container chưa có POSTGRES_PASSWORD.' }
$env:DATABASE_PASSWORD = $pgPasswordSetting.Line.Substring('POSTGRES_PASSWORD='.Length)

$env:PORT = '8082'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$env:GOPLANT_JWT_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()

mvn spring-boot:run
```

Giữ terminal này mở. API chạy ở `http://localhost:8082`; kiểm tra tại `http://localhost:8082/actuator/health`. Mật khẩu trong cấu hình container được dùng cho backend; với database đã tồn tại, thay đổi `POSTGRES_PASSWORD` trong Compose không tự đổi mật khẩu role bên trong database. Nếu mật khẩu role đã được đổi thủ công, hãy đặt `DATABASE_PASSWORD` thành mật khẩu hiện tại. Không dùng `docker compose down -v` để xử lý lỗi đăng nhập vì lệnh đó xóa volume dữ liệu.

Nếu backend báo `password authentication failed`, kiểm tra lại `DATABASE_PASSWORD` và đảm bảo backend đang kết nối đúng PostgreSQL. Không chạy đồng thời PostgreSQL Windows và Docker trên cùng cổng `5432`. Nếu muốn dùng PostgreSQL cài trên Windows, dừng container Docker và đặt `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` theo cấu hình của instance đó.

Nếu lệnh `mvn` chưa nhận diện, dùng Maven đã cài trên Windows:

Đường dẫn Windows mẫu cho lệnh này có trong [`backend/README.md`](backend/README.md); thay bằng thư mục Maven đã cài trên máy.

Admin hiện có `admin@goplant.test` được giữ nguyên. Bootstrap chỉ tạo tài khoản khi email chưa tồn tại; không ghi đè thông tin tài khoản đã có. Với database mới, xem hướng dẫn tạo admin trong [`backend/README.md`](backend/README.md).

## Chạy app trong Android Emulator

Trước tiên mở Android Studio → **Device Manager** và khởi chạy một AVD. Kiểm tra tên thiết bị có trong danh sách bằng:

```powershell
& "$env:ANDROID_HOME\emulator\emulator.exe" -list-avds
```

Sau khi AVD đã khởi động hoàn toàn, mở PowerShell thứ hai:

```powershell
cd GOPLANTT
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run android
```

Trong file `.env` (tạo từ [`GOPLANTT/.env.example`](GOPLANTT/.env.example)), đặt địa chỉ API cho emulator:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8082
```

`10.0.2.2` là địa chỉ để Android Emulator truy cập backend trên máy tính. Giữ cả cửa sổ Expo và backend mở khi dùng app. Nếu đổi cổng backend, cập nhật cùng cổng trong `.env` rồi khởi động lại Expo.

Nếu mọi AVD đều thoát với thông báo `too many emulator instances`, đóng các AVD khác và thoát hẳn MuMuPlayer, BlueStacks, Nox hoặc phần mềm giả lập Android khác (kể cả biểu tượng dưới khay hệ thống). Nếu MuMuPlayer vẫn chạy nền, mở PowerShell bằng quyền quản trị và chạy `Stop-Service MuMuPlayerRemoteService -Force`. Sau đó chạy `& "$env:ANDROID_HOME\platform-tools\adb.exe" kill-server`, mở lại Device Manager và chọn **Cold Boot Now**. Nếu vẫn lỗi, cập nhật hoặc cài lại **Android Emulator** trong **SDK Manager → SDK Tools**; thử system image bản ổn định thay cho image preview. Kiểm tra AVD bằng `& "$env:ANDROID_HOME\platform-tools\adb.exe" devices -l`.

Sau khi đăng nhập bằng tài khoản admin, mở **Tài khoản → Quản lý danh mục cây** để thêm cây. Backend tự nạp 21 cây phổ biến khi khởi động và yêu cầu nguồn tham khảo khi admin thêm cây mới.

## Email xác minh

Đăng ký người dùng cần SMTP để gửi email và `GOPLANT_PUBLIC_API_URL` là địa chỉ backend mà thiết bị nhận thư có thể truy cập. Cấu hình SMTP được hướng dẫn trong [`backend/README.md`](backend/README.md). Nếu chưa cấu hình, API từ chối đăng ký thay vì tạo tài khoản không thể xác minh.

## Tài liệu theo phần

- [Frontend Expo/React Native](GOPLANTT/README.md)
- [Backend Spring Boot, PostgreSQL, SMTP và API](backend/README.md)

Người dùng có thể thay ảnh minh họa mặc định của cây mình sở hữu bằng ảnh JPEG/PNG; ảnh được lưu riêng tư trong PostgreSQL. Backend hiện chưa có API cho nhật ký chăm sóc, lịch nhắc, thời tiết, cảm biến, đổi/khôi phục mật khẩu, xuất hoặc xóa tài khoản. Các phần chưa kết nối không ghi dữ liệu nghiệp vụ giả.
