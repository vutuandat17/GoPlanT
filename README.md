# GoPlant

GoPlant gồm ứng dụng Expo/React Native trong [`GOPLANTT/`](GOPLANTT/README.md) và REST API Spring Boot trong [`backend/`](backend/README.md). Backend dùng PostgreSQL để lưu tài khoản, danh mục cây, khu vườn, cây của người dùng và yêu thích.

## Yêu cầu

- JDK 21
- Maven 3.9 trở lên
- Node.js và npm
- Docker Desktop đang chạy
- Android Studio Emulator hoặc thiết bị Android

## Chạy PostgreSQL và backend

Mở PowerShell thứ nhất:

```powershell
cd backend
docker compose up -d postgres

$env:PORT = '8082'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$env:GOPLANT_JWT_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()

mvn spring-boot:run
```

Nếu lệnh `mvn` chưa nhận diện, dùng Maven đã cài trên Windows:

Đường dẫn Windows mẫu cho lệnh này có trong [`backend/README.md`](backend/README.md); thay bằng thư mục Maven đã cài trên máy.

Giữ cửa sổ backend mở. API chạy tại `http://localhost:8082`; kiểm tra trạng thái ở `http://localhost:8082/actuator/health`. PostgreSQL dùng database/user/password `goplant` theo cấu hình Docker mặc định.

Admin hiện có `admin@goplant.test` được giữ nguyên. Bootstrap chỉ tạo tài khoản khi email chưa tồn tại; không ghi đè thông tin tài khoản đã có. Với database mới, xem hướng dẫn tạo admin trong [`backend/README.md`](backend/README.md).

## Chạy app trong Android Emulator

Mở PowerShell thứ hai, bảo đảm Android Emulator đã khởi động, rồi chạy:

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

Sau khi đăng nhập bằng tài khoản admin, mở **Tài khoản → Quản lý danh mục cây** để thêm cây. Backend tự nạp 21 cây phổ biến khi khởi động và yêu cầu nguồn tham khảo khi admin thêm cây mới.

## Email xác minh

Đăng ký người dùng cần SMTP để gửi email và `GOPLANT_PUBLIC_API_URL` là địa chỉ backend mà thiết bị nhận thư có thể truy cập. Cấu hình SMTP được hướng dẫn trong [`backend/README.md`](backend/README.md). Nếu chưa cấu hình, API từ chối đăng ký thay vì tạo tài khoản không thể xác minh.

## Tài liệu theo phần

- [Frontend Expo/React Native](GOPLANTT/README.md)
- [Backend Spring Boot, PostgreSQL, SMTP và API](backend/README.md)

Người dùng có thể thay ảnh minh họa mặc định của cây mình sở hữu bằng ảnh JPEG/PNG; ảnh được lưu riêng tư trong PostgreSQL. Backend hiện chưa có API cho nhật ký chăm sóc, lịch nhắc, thời tiết, cảm biến, đổi/khôi phục mật khẩu, xuất hoặc xóa tài khoản. Các phần chưa kết nối không ghi dữ liệu nghiệp vụ giả.
