# Hướng dẫn Cấu hình & Chạy thử Email Xác thực (GoPlant Backend)

Tài liệu này hướng dẫn cách thiết lập tính năng **gửi email xác minh tài khoản & đặt lại mật khẩu** ở môi trường phát triển cục bộ (**Mailpit**) và khi triển khai thực tế (**SMTP thật**).

---

## 1. Phân biệt Mailpit (Dev Local) và SMTP thật (Deploy Production)

| Tiêu chí | Chạy thử Local với **Mailpit** | Deploy Production với **SMTP thật** |
|---|---|---|
| **Mục đích** | Giả lập hộp thư SMTP nội bộ để dev/test luồng gửi mail | Gửi email thật tới hộp thư người dùng (Gmail, Outlook...) |
| **Nơi xem email** | Giao diện web nội bộ tại `http://localhost:8025` (không gửi ra Internet) | Hộp thư thật của người dùng cuối |
| **Dịch vụ sử dụng** | Container `mailpit` trong `backend/compose.yaml` (`profiles: ["mail"]`) | Nhà cung cấp SMTP: Gmail App Password, Brevo, Resend, SendGrid, Amazon SES |
| **Có dùng khi Deploy?** | **Không.** `docker compose up -d` mặc định không bật Mailpit | **Bắt buộc** nếu bật `GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION=true` |
| **Cần sửa code Java?** | Không | Không — chỉ đổi biến môi trường |

---

## 2. Cách A: Chạy thử với Mailpit ở Local (Khuyên dùng khi dev)

### Lưu ý quan trọng về Terminal (PowerShell)
- Lệnh bật Docker (`docker compose --profile mail up -d`) chạy nền nên **không bắt buộc** cùng terminal, nhưng phải chạy trước khi đăng ký tài khoản.
- Toàn bộ biến môi trường `$env:...` (DB, `PORT`, `GOPLANT_JWT_SECRET`, `MAIL_*`, `GOPLANT_AUTH_*`) và lệnh `mvn spring-boot:run` **BẮT BUỘC chạy trong CÙNG một cửa sổ PowerShell**. Nếu Backend cũ đang chạy, hãy nhấn `Ctrl + C` để dừng trước.

### Bộ lệnh trọn gói (chạy tại thư mục `backend/`)

```powershell
# 1. Khởi động PostgreSQL và Mailpit (SMTP :1025, Web UI :8025)
docker compose --profile mail up -d

# 2. Lấy mật khẩu PostgreSQL từ container & cấu hình PORT, JWT
#2.1
docker compose up -d postgres

#2.2
$containerId = docker compose ps -q postgres
if (-not $containerId) { throw 'Không tìm thấy container PostgreSQL.' }
$pgPasswordSetting = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $containerId | Select-String '^POSTGRES_PASSWORD='
if (-not $pgPasswordSetting) { throw 'Container chưa có POSTGRES_PASSWORD.' }
$env:DATABASE_PASSWORD = $pgPasswordSetting.Line.Substring('POSTGRES_PASSWORD='.Length)

#2.3
$env:PORT = '8082'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$env:GOPLANT_JWT_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()



# 3. Cấu hình Mailpit & bật bắt buộc xác minh email
$env:GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION = 'true'
$env:GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN = 'false'
$env:GOPLANT_PUBLIC_API_URL = 'http://localhost:8082'
$env:GOPLANT_EMAIL_FROM = 'no-reply@goplant.local'

$env:MAIL_HOST = 'localhost'
$env:MAIL_PORT = '1025'
$env:MAIL_USERNAME = ''
$env:MAIL_PASSWORD = ''
$env:MAIL_SMTP_AUTH = 'false'
$env:MAIL_SMTP_STARTTLS = 'false'

# 4. Khởi động Backend
& "C:\tools\apache-maven-3.10.0\bin\mvn.cmd" spring-boot:run ( tùy ae lưu ở đâu )
```

*(Nếu `mvn` đã có sẵn trong `PATH`, có thể thay bước 4 bằng `mvn spring-boot:run`.)*

### Kiểm tra kết quả
1. Mở giao diện app/web, đăng ký một tài khoản mới với email bất kỳ.
2. Mở trình duyệt tại **`http://localhost:8025`** để xem hộp thư Mailpit.
3. Mở email vừa nhận, bấm nút **Xác minh tài khoản GoPlant**, sau đó bấm **Xác minh email ngay** trên trang xác nhận.
4. Quay lại ứng dụng và đăng nhập bằng tài khoản vừa kích hoạt.

---

## 3. Cách B: Chạy Local không cần gửi email

Nếu chỉ muốn phát triển các tính năng khác và kích hoạt thẳng tài khoản ngay khi đăng ký:

```powershell
$env:GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION = 'false'
```

Khi đó tài khoản mới sẽ được đặt thẳng trạng thái `active` và tự đăng nhập ngay sau khi đăng ký.

---

## 4. Cách C: Chỉnh sửa biến môi trường khi Deploy (SMTP thật)

Khi triển khai lên Staging / Production, không bật `mailpit`. Hãy cấu hình các biến môi trường sau (hoặc đặt trong `backend/.env` / Secret Manager):

```env
GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION=true
GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN=false
GOPLANT_PUBLIC_API_URL=https://api.tenmien-cua-ban.com
GOPLANT_EMAIL_FROM=no-reply@tenmien-cua-ban.com
GOPLANT_APP_LOGIN_URL=goplantt://auth/login
GOPLANT_WEB_LOGIN_URL=https://app.tenmien-cua-ban.com/auth/login

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password-or-smtp-api-key
MAIL_SMTP_AUTH=true
MAIL_SMTP_STARTTLS=true
```

> **Lưu ý với Gmail SMTP**: Phải bật xác minh 2 bước (2FA) và tạo **App Password (16 ký tự)** cho `MAIL_PASSWORD`, không dùng mật khẩu đăng nhập Gmail thông thường.

### Bảng tham chiếu biến môi trường

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `GOPLANT_AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` | `true`: bắt buộc xác minh email trước khi đăng nhập |
| `GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN` | `false` | Chỉ dùng `true` trên profile `local`; luôn giữ `false` khi deploy |
| `GOPLANT_PUBLIC_API_URL` | *(rỗng)* | URL công khai của Backend dùng để tạo link xác minh trong email |
| `GOPLANT_EMAIL_FROM` | `no-reply@goplant.local` | Địa chỉ người gửi hiển thị trên email |
| `GOPLANT_APP_LOGIN_URL` | `goplantt://auth/login` | Deep link trên nút **"Mở ứng dụng GoPlant"** sau khi xác minh |
| `GOPLANT_WEB_LOGIN_URL` | `http://localhost:8081/auth/login` | Link nút **"Đăng nhập trên trình duyệt"** |
| `MAIL_HOST`, `MAIL_PORT` | *(rỗng)* / `587` | Địa chỉ và cổng máy chủ SMTP (`1025` với Mailpit, `587` với STARTTLS) |
| `MAIL_USERNAME`, `MAIL_PASSWORD` | *(rỗng)* | Tài khoản và mật khẩu/App Password/API key SMTP |
| `MAIL_SMTP_AUTH`, `MAIL_SMTP_STARTTLS` | `true` / `true` | Đặt `false` khi dùng Mailpit local, `true` khi dùng SMTP thật |

---

## 5. Xử lý nhanh lỗi thường gặp

- **`Không thể gửi email lúc này. Vui lòng thử lại sau.` (`503`)**:
  - Nếu đang dùng Mailpit: kiểm tra container `mailpit` đã chạy chưa (`docker compose ps`), hoặc chạy lại `docker compose --profile mail up -d`.
  - Nếu đang dùng SMTP thật: kiểm tra lại `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` (App Password) và `MAIL_SMTP_STARTTLS`.
- **`Dịch vụ email hiện chưa sẵn sàng...` (`503`)**:
  - Do chưa đặt `MAIL_HOST` hoặc chưa đặt `GOPLANT_PUBLIC_API_URL` trong cùng terminal chạy Backend.
