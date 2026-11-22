# Hướng dẫn Cài đặt & Vận hành Tính năng Tích hợp Ảnh & Ảnh đại diện (GoPlant)

Tài liệu này hướng dẫn cài đặt thư viện mới, cấu hình môi trường Backend/Frontend và kiểm thử toàn bộ tính năng **Upload / Hiển thị ảnh** (Ảnh đại diện Avatar, Khu vườn, Cây trồng, Nhật ký) trên cả **Mobile Native** và **Web**.

---

## 1. Tổng quan kiến trúc

- **Lưu trữ**: Ảnh được kiểm tra định dạng thực tế (`JPEG`/`PNG`, tối đa `5 MB`, độ phân giải `<= 20 MP`) qua `ImageValidator.java` và lưu trực tiếp dưới dạng `bytea` trong PostgreSQL (`V3`, `V5`, `V10`, `V17__user_avatars.sql`).
- **Bảo mật & Đa nền tảng**:
  - Mọi endpoint ảnh đều yêu cầu JWT (`Authorization: Bearer <accessToken>`).
  - Trên **Mobile Native**: dùng `expo-file-system` (`File`) để upload và `ExpoImage` gửi header `Authorization` khi hiển thị.
  - Trên **Web**: tự động chuyển ảnh sang `Blob` khi upload và dùng `fetch` + `URL.createObjectURL(blob)` (`AuthorizedImage.tsx`) để hiển thị ảnh riêng tư trên thẻ `<img>`.
- **Tối ưu trước khi gửi**: Ảnh được chọn từ Thư viện hoặc chụp từ Camera sẽ tự động resize (`512px` cho Avatar, `1600px` cho Vườn/Cây/Nhật ký) và nén sang JPEG (`quality: 0.8`) qua `expo-image-manipulator`.

---

## 2. Cài đặt thư viện mới (Frontend `GOPLANTT`)

Khi kéo code về máy mới hoặc thiết lập lại `node_modules`, chạy các lệnh sau trong thư mục `GOPLANTT/`:

```powershell
cd GOPLANTT
npm install
```

Nếu cần cài riêng hoặc cập nhật thư viện xử lý/nén ảnh mới (`expo-image-manipulator`) theo đúng phiên bản Expo SDK của dự án:

```powershell
# Trên Windows PowerShell (dùng npx.cmd nếu npx.ps1 bị chặn ExecutionPolicy)
npx.cmd expo install expo-image-manipulator
```

*(Các thư viện ảnh liên quan đã được khai báo trong `GOPLANTT/package.json`: `expo-image-picker`, `expo-image-manipulator`, `expo-image`, `expo-file-system`.)*

### Lưu ý khi chạy trên thiết bị
- **Web (`npx.cmd expo start --web`)** và **Expo Go**: khởi động lại Metro là dùng được ngay.
- **Android / iOS Development Build (`.apk`/`.ipa` tự build)**: nếu đang dùng bản `.apk` build từ trước khi cài `expo-image-manipulator`, cần build lại dev-client một lần để nạp native module mới.

---

## 3. Các cấu hình cần thiết để chạy được tính năng ảnh

### A. Backend (`backend/`)
1. **Áp dụng Migration `V17__user_avatars.sql`**:
   - Khởi động lại Backend (với PostgreSQL đang chạy ở cổng `5432`) để Flyway tự động tạo bảng `user_avatars`.
2. **Giới hạn Multipart (`application.yml`)**:
   - Đã cấu hình sẵn `max-file-size: 5MB` và `max-request-size: 6MB`.
3. **CORS cho trình duyệt Web (`GOPLANT_CORS_ALLOWED_ORIGINS`)**:
   - Mặc định ở local cho phép `http://localhost:8081,http://localhost:19006`.
   - Nếu chạy Web ở cổng/domain khác, bắt buộc thêm origin đó vào `GOPLANT_CORS_ALLOWED_ORIGINS` để trình duyệt gửi được request `POST` upload ảnh và `GET` ảnh kèm `Authorization`.

### B. Frontend (`GOPLANTT/`)
1. **Quyền thiết bị (`GOPLANTT/app.json`)**:
   - Plugin `expo-image-picker` đã cấu hình sẵn cả `photosPermission` (thư viện ảnh) và `cameraPermission` (chụp ảnh trực tiếp).
2. **Địa chỉ API (`GOPLANTT/.env`)**:
   - Web local: `EXPO_PUBLIC_API_URL=http://localhost:8082`
   - Android Emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8082`
   - Điện thoại thật cùng Wi-Fi: `EXPO_PUBLIC_API_URL=http://<IP-LAN-MAY-TINH>:8082`

---

## 4. Danh sách API tích hợp ảnh

| Chức năng | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| **Ảnh đại diện cá nhân** | `POST`, `GET`, `DELETE /api/v1/auth/me/avatar` | User đăng nhập | Crop vuông `1:1`, resize tối đa `512px` |
| **Admin xem Avatar user** | `GET /api/v1/admin/users/{id}/avatar` | Admin | Hiển thị trong `/admin/users` |
| **Ảnh khu vườn** | `POST`, `GET`, `DELETE /api/v1/gardens/{id}/photo` | Chủ vườn | Tỉ lệ `16:9`, resize tối đa `1600px` |
| **Ảnh cây trồng** | `POST`, `GET /api/v1/plants/{id}/photo` | Chủ cây | Tỉ lệ `4:3`, resize tối đa `1600px` |
| **Ảnh nhật ký** | `POST`, `GET`, `DELETE /api/v1/journals/{id}/photos[/{photoId}]` | Chủ nhật ký | Resize tối đa `1600px` |

---

## 5. Cách khởi động & kiểm thử nhanh ở Local

1. **Bật PostgreSQL & Backend** (tại `backend/`):
   ```powershell
   docker compose up -d postgres
   # Đặt DATABASE_PASSWORD, PORT=8082, GOPLANT_JWT_SECRET rồi chạy:
   & "C:\tools\apache-maven-3.10.0\bin\mvn.cmd" spring-boot:run
   ```
2. **Khởi động Frontend** (tại `GOPLANTT/`):
   ```powershell
   npx.cmd expo start --web
   ```
3. **Kiểm tra trên giao diện**:
   - Vào **Tài khoản → Hồ sơ cá nhân** (`/account/profile`) → bấm **Đổi ảnh đại diện** → kiểm tra ảnh hiển thị ở Hồ sơ, Tổng quan tài khoản, nút Avatar góc trên các tab, và trong `/admin/users`.
   - Thử đổi ảnh **Khu vườn**, **Cây trồng**, **Nhật ký** (trên Mobile sẽ có hộp thoại chọn **Chụp ảnh mới** hoặc **Chọn từ thư viện**).

---

## 6. Lưu ý khi Deploy lên Production

- **Reverse Proxy (Nginx / Cloudflare / Load Balancer)**: Nginx mặc định chỉ cho phép `client_max_body_size 1m` (1 MB). Khi deploy cần tăng lên ít nhất **`client_max_body_size 10m;`** để không bị chặn `413 Payload Too Large` trước khi tới Spring Boot.
- **HTTPS**: Bản build Mobile Production yêu cầu `EXPO_PUBLIC_API_URL` dùng `https://` để tải và upload ảnh.
- **CORS**: Cập nhật `GOPLANT_CORS_ALLOWED_ORIGINS` đúng domain Web Production.
