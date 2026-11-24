# GoPlant Backend

REST API cho ứng dụng **GoPlant** (Expo / React Native + Web), xây dựng trên **Spring Boot 3.5.16**, **Java 21**, **PostgreSQL 17**, **Spring JDBC** và **Flyway** (`V1` → `V19`).

---

## 1. Thông số & Yêu cầu cài đặt môi trường

| Thành phần | Phiên bản yêu cầu | Ghi chú |
|---|---|---|
| **Java (JDK)** | **21** (Eclipse Temurin / OpenJDK 21) | Khai báo `<java.version>21</java.version>` trong `pom.xml` |
| **Apache Maven** | **3.9+** (ví dụ `3.9.x` hoặc `3.10.0`) | Dùng để build & chạy `mvn spring-boot:run`, `mvn test` |
| **PostgreSQL** | **17** | Có thể dùng **Neon Cloud (khuyên dùng cho nhóm)** hoặc container `postgres:17-alpine` |
| **Docker Desktop** | Bản mới nhất *(tùy chọn)* | Chỉ cần nếu chạy PostgreSQL local hoặc Mailpit local qua `compose.yaml` |
| **Node.js** | **20+** (khuyên dùng **22+ / 24**) | Dùng để chạy Frontend `GOPLANTT` và script `scripts/sync-catalog-photos.mjs` |

> **Lưu ý cổng PostgreSQL local:** Nếu trên Windows có cài sẵn service PostgreSQL chạy cổng `5432`, hãy tắt trước khi bật container Docker PostgreSQL (`Stop-Service postgresql-x64-17`) để tránh xung đột cổng.

---

## 2. Cấu hình & Chạy Test Local (Backend + Frontend)

### Cách A: Chạy Local kết nối nhánh `dev` trên Neon *(Khuyên dùng khi làm nhóm)*

Giữ nhánh `production` trên Neon cho bản deploy Render thật, và tạo nhánh **`dev`** riêng trên Neon cho máy cá nhân/nhóm test:

1. Trên **Neon Console** → **Branches** → **Create branch** tên `dev` từ `production`.
2. Vào **Connect** (tắt *Connection pooling* để lấy **Direct connection**), tạo/cập nhật file `backend/.env` *(file này đã nằm trong `.gitignore`, không commit lên Git)*: - tôi sẽ gửi cho ae nếu cần 

```properties
PORT=8082

# Kết nối Neon nhánh dev
DATABASE_URL=jdbc:postgresql://<host-branch-dev>:5432/neondb?sslmode=require
DATABASE_USERNAME=<user-cua-dev>
DATABASE_PASSWORD=<password-cua-dev>

# Khóa ký JWT (bắt buộc ít nhất 32 ký tự)
GOPLANT_JWT_SECRET=<chuoi-bi-mat-ngau-nhien-it-nhat-32-ky-tu>

# API thời tiết OpenWeatherMap (tùy chọn, dùng cho thời tiết khu vườn)
OPENWEATHER_API_KEY=<openweather-api-key>

# Cho phép Frontend Web/Expo gọi API
GOPLANT_CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
```

3. *(Chỉ dùng 1 lần cho DB mới hoàn toàn)* Thêm tạm 2 dòng sau vào `backend/.env` để tạo tài khoản Admin đầu tiên (`BootstrapAdmin` sẽ tự bỏ qua nếu email đã tồn tại): - đã tạo rồi tôi sẽ gửi ae sau

```properties
GOPLANT_BOOTSTRAP_ADMIN_EMAIL=admin@goplant.test
GOPLANT_BOOTSTRAP_ADMIN_PASSWORD=<mat-khau-it-nhat-8-ky-tu>
```

4. Khởi động Backend tại thư mục `backend/`:

```powershell
cd backend
Remove-Item Env:DATABASE_URL, Env:DATABASE_USERNAME, Env:DATABASE_PASSWORD -ErrorAction SilentlyContinue
mvn spring-boot:run
```

*(Nếu `mvn` chưa có trong `PATH`, gọi trực tiếp đường dẫn cài đặt, ví dụ: `& "C:\tools\apache-maven-3.10.0\bin\mvn.cmd" spring-boot:run`.)*

---

### Cách B: Chạy Local với Docker PostgreSQL (`compose.yaml`)

Dùng khi muốn chạy hoàn toàn offline trên máy cá nhân:

```powershell
cd backend
docker compose up -d postgres
$containerId = docker compose ps -q postgres
$pgPasswordSetting = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $containerId | Select-String '^POSTGRES_PASSWORD='
$env:DATABASE_PASSWORD = $pgPasswordSetting.Line.Substring('POSTGRES_PASSWORD='.Length)

$env:PORT = '8082'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$env:GOPLANT_JWT_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()

mvn spring-boot:run
```

> Không dùng `docker compose down -v` khi sửa lỗi mật khẩu vì lệnh `-v` sẽ xóa sạch dữ liệu volume PostgreSQL.

---

### Cấu hình & Chạy Frontend (`GOPLANTT`) khi test Local

1. Mở file `GOPLANTT/.env` và đặt `EXPO_PUBLIC_API_URL` theo thiết bị bạn đang test:

| Môi trường test Frontend | Giá trị `EXPO_PUBLIC_API_URL` trong `GOPLANTT/.env` |
|---|---|
| **Expo Web (trình duyệt máy tính)** | `http://localhost:8082` |
| **Android Emulator** | `http://10.0.2.2:8082` |
| **Điện thoại thật (cùng Wi-Fi)** | `http://<IP_LAN_MAY_TINH>:8082` |
| **Trỏ thẳng Backend Render đã deploy** | `https://goplant-backend.onrender.com` |

2. Khởi động Frontend:

```powershell
cd GOPLANTT
npx expo start
```

- Nhấn `w` để mở Web, hoặc `a` để mở Android Emulator.
- Kiểm tra nhanh Backend đang sống tại `http://localhost:8082/api/v1/health` hoặc `http://localhost:8082/actuator/health`.

---

## 3. Cấu hình & Kiểm thử Xác thực Email

Mặc định `GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION=false` để dev/test đăng ký tài khoản sử dụng ngay. Khi cần kiểm thử luồng gửi email xác minh hoặc quên mật khẩu, chọn 1 trong 2 cách sau:

### Cách 1: Test Local bằng Mailpit (Không gửi ra Internet)

1. Bật container Mailpit (cổng SMTP `1025`, Web UI `8025`):

```powershell
cd backend
docker compose --profile mail up -d
```

2. Thêm vào `backend/.env` (hoặc set biến PowerShell) trước khi chạy `mvn spring-boot:run`:

```properties
GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION=true
GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN=false
GOPLANT_PUBLIC_API_URL=http://localhost:8082
GOPLANT_EMAIL_FROM=no-reply@goplant.local

MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_SMTP_AUTH=false
MAIL_SMTP_STARTTLS=false
```

3. Sau khi đăng ký hoặc bấm **Gửi lại email xác minh**, mở `http://localhost:8025` để xem email HTML và bấm nút xác minh.

### Cách 2: Gửi tới Gmail thật (SMTP thật)

Thêm vào `backend/.env` (hoặc Environment Variables trên Render khi deploy):

```properties
GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION=true
GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN=false
GOPLANT_PUBLIC_API_URL=http://localhost:8082   # Đổi thành https://goplant-backend.onrender.com khi deploy
GOPLANT_EMAIL_FROM=<your-gmail@gmail.com>
GOPLANT_APP_LOGIN_URL=goplantt://auth/login
GOPLANT_WEB_LOGIN_URL=http://localhost:8081/auth/login

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=<your-gmail@gmail.com>
MAIL_PASSWORD=<google-app-password-16-ky-tu>
MAIL_SMTP_AUTH=true
MAIL_SMTP_STARTTLS=true
```

> **Lưu ý:** `MAIL_PASSWORD` phải là **App Password (16 ký tự)** tạo trong Bảo mật Tài khoản Google (đã bật Xác minh 2 bước), không dùng mật khẩu đăng nhập Gmail thông thường.

### Bảng biến môi trường Email & Xác thực

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` | `true`: bắt buộc xác minh email trước khi đăng nhập |
| `GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN` | `false` | Chỉ dùng ở profile `local` để trả token trực tiếp qua API; luôn đặt `false` khi deploy |
| `GOPLANT_PUBLIC_API_URL` | *(rỗng)* | URL gốc của Backend để tạo link xác minh / đặt lại mật khẩu trong email |
| `GOPLANT_EMAIL_FROM` | `no-reply@goplant.local` | Địa chỉ người gửi hiển thị trên email |
| `GOPLANT_APP_LOGIN_URL` | `goplantt://auth/login` | Deep link trên nút mở app sau khi xác minh thành công |
| `GOPLANT_WEB_LOGIN_URL` | `http://localhost:8081/auth/login` | Link nút đăng nhập web trên trang kết quả xác minh |
| `MAIL_HOST`, `MAIL_PORT` | *(rỗng)* / `587` | Máy chủ & cổng SMTP (`1025` cho Mailpit, `587` cho STARTTLS) |
| `MAIL_USERNAME`, `MAIL_PASSWORD` | *(rỗng)* | Tài khoản & App Password / API key SMTP |
| `MAIL_SMTP_AUTH`, `MAIL_SMTP_STARTTLS` | `true` / `true` | Đặt `false` khi dùng Mailpit local, `true` khi dùng SMTP thật |

---

## 4. Nạp dữ liệu & Ảnh Danh mục Cây

- Khi khởi động, `PopularPlantCatalogSeeder` tự động nạp idempotent **91 loài cây** từ `src/main/resources/seed/plants.json` vào `plant_catalog` (yêu cầu có ít nhất 1 tài khoản `admin` đang `active`).
- Để tự động tải và gắn ảnh đại diện cho toàn bộ các loài cây chưa có ảnh (chỉ cần chạy **1 lần** cho mỗi DB mới):

```powershell
node backend/scripts/sync-catalog-photos.mjs --url http://localhost:8082 --email admin@goplant.test --password <MAT_KHAU_ADMIN>
```

---

## 5. Tổng quan API chính

| Nhóm | Method & Path | Quyền | Chức năng |
|---|---|---|---|
| **Health** | `GET /api/v1/health`, `GET /actuator/health` | Public | Kiểm tra trạng thái hệ thống |
| **Auth** | `POST /api/v1/auth/register`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `verify-email`, `resend-verification` | Public | Đăng ký, đăng nhập JWT + Refresh Token, xác minh & khôi phục mật khẩu |
| **Account** | `GET/PUT /api/v1/auth/me`, `POST /api/v1/auth/change-password`, `POST/GET/DELETE /api/v1/auth/me/avatar` | User | Hồ sơ cá nhân, đổi mật khẩu, ảnh đại diện |
| **Catalog** | `GET /api/v1/catalog/plants`, `GET /api/v1/catalog/plants/{id}/photo` | Public | Danh sách cây duyệt xuất bản (phân trang) & ảnh danh mục |
| **Favorites** | `GET /api/v1/favorites`, `POST/DELETE /api/v1/catalog/plants/{id}/favorite` | User | Danh sách cây trồng mong muốn |
| **Admin Catalog** | `GET/POST /api/v1/admin/catalog/plants`, `PUT/DELETE /api/v1/admin/catalog/plants/{id}`, `POST .../restore`, `POST/DELETE .../photo` | Admin / Moderator | Quản lý toàn bộ danh mục cây, ẩn/khôi phục, ảnh danh mục |
| **Gardens** | `GET/POST/PUT/DELETE /api/v1/gardens[/{id}]`, `POST/GET/DELETE /api/v1/gardens/{id}/photo`, `GET /api/v1/gardens/{id}/weather` | Owner | Quản lý khu vườn, ảnh bìa & thời tiết khu vực |
| **Owned Plants** | `GET/POST/PUT/DELETE /api/v1/plants[/{id}]`, `POST/GET/DELETE /api/v1/plants/{id}/photo` | Owner | Hồ sơ cây đang sở hữu (soft-delete + tắt lịch chăm sóc liên quan) |
| **Care Schedules** | `GET/POST /api/v1/plants/{plantId}/schedules`, `GET/PUT/DELETE /api/v1/schedules[/{id}]`, `GET /api/v1/schedules/today`, `GET /api/v1/schedules/calendar`, `POST /api/v1/tasks/{taskId}/complete\|skip` | Owner | Lập lịch chăm sóc, việc cần làm hôm nay, lịch tuần |
| **Journals & Growth** | `GET /api/v1/journals`, `GET/POST /api/v1/plants/{plantId}/journals`, `PUT/DELETE /api/v1/journals/{id}`, `POST/GET/DELETE .../photos`, `GET/POST/DELETE /api/v1/plants/{plantId}/growth` | Owner | Nhật ký phát triển (tối đa 5 ảnh/bài) & chỉ số sinh trưởng |
| **Admin Users** | `GET /api/v1/admin/users[/{id}]`, `stats`, `audit-logs`, `auth-events`, `status`, `roles`, `resend-verification`, `send-password-reset`, `GET /api/v1/admin/users/{id}/avatar` | Admin | Quản lý người dùng, phân quyền RBAC, nhật ký kiểm toán & sự kiện đăng nhập |

---

## 6. Kiểm thử & Deploy

### Chạy kiểm thử tự động Backend
```powershell
cd backend
mvn -q test
```

### Deploy bằng Docker / Render
- `backend/Dockerfile` sử dụng multi-stage build (**Maven 3.9 + Temurin 21**) và cấu hình sẵn **Google Maven Central Mirror** (`maven-central.storage-download.googleapis.com/maven2`) để tránh lỗi `429 Too Many Requests` trên môi trường build cloud dùng chung (như Render).
- Trên Render: chọn **Runtime = Docker**, **Root Directory = `backend`**, **Health Check Path = `/api/v1/health`**, và khai báo các biến môi trường `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `GOPLANT_JWT_SECRET`, `OPENWEATHER_API_KEY`, `GOPLANT_CORS_ALLOWED_ORIGINS`, `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70.0`.
