# Tổng quan & Kết quả triển khai GoPlant (Giai đoạn 1 & Giai đoạn 2)

Tài liệu này tổng hợp chi tiết các nhiệm vụ đã triển khai, kiến trúc kỹ thuật và kết quả kiểm chứng cho **Giai đoạn 1** và **Giai đoạn 2** của dự án GoPlant (`backend` Spring Boot + `GOPLANTT` Expo/React Native).

---

## Giai đoạn 1: Hoàn thiện các phân hệ nghiệp vụ cốt lõi (Backend & Frontend)

### 1.1. Phân hệ Lịch chăm sóc & Công việc (`care_schedules` & `care_tasks`)
**Mục tiêu:** Xây dựng hệ thống lập lịch chăm sóc cây linh hoạt theo chu kỳ lặp và tự động sinh công việc cụ thể hằng ngày theo múi giờ người dùng.

- **Database Migration:**
  - `backend/src/main/resources/db/migration/V4__care_schedules_and_tasks.sql`
  - Bảng `care_schedules`: Lưu cấu hình lịch lặp (`task_type`, `repeat_type`, `frequency_days`, `days_of_week`, `time_of_day`, `start_date`, `end_date`, `timezone`, `next_due_at`, `is_active`).
  - Hỗ trợ đầy đủ danh mục công việc: tưới nước, bón phân, cắt tỉa, làm cỏ (`weeding`), thay đất/chậu (`repotting`), vệ sinh cây (`cleaning`), kiểm tra môi trường (`environment_check`), phòng trừ sâu bệnh (`pest_control`), phun sương (`misting`), khác (`other`).
  - Hỗ trợ 2 hình thức lặp: `DAILY_INTERVAL` (bắt buộc `frequency_days`) và `WEEKLY` (bắt buộc `days_of_week`).
  - Bảng `care_tasks`: Lưu các công việc cụ thể được sinh trước (rolling window) với trạng thái `pending`, `completed`, `skipped`, `scheduled_date`, `due_at`, `completed_at`.
- **Backend (`vn.goplant.backend.care`):**
  - `CareScheduleController.java`, `CareScheduleService.java`, `RecurrenceCalculator.java`, `CareTaskGenerationJob.java`, `CareConfig.java`.
  - Xử lý tính toán mốc lặp và chuyển đổi múi giờ (`timezone` IANA) chính xác; job định kỳ sinh `care_tasks` tự động.
  - Các API chính: CRUD lịch chăm sóc theo cây (`/api/v1/plants/{plantId}/schedules`, `/api/v1/schedules/{id}`), lấy danh sách công việc theo ngày (`/api/v1/tasks`), cập nhật trạng thái hoàn thành/bỏ qua (`/api/v1/tasks/{id}/complete`, `/api/v1/tasks/{id}/skip`).
- **Frontend (`GOPLANTT`):**
  - Đấu nối API vào `GOPLANTT/src/services/api.ts` và `GOPLANTT/src/features/schedule/CareScheduleStore.tsx`.
  - Hoàn thiện giao diện tạo/xem/chi tiết lịch lặp (bao gồm chọn chu kỳ lặp theo ngày hoặc theo các thứ trong tuần) và thao tác Hoàn thành/Bỏ qua tại `GOPLANTT/src/features/schedule/ScheduleScreens.tsx`, đồng thời hiển thị thẻ nhắc việc hôm nay trên `GOPLANTT/src/features/home/HomeScreen.tsx`.

### 1.2. Phân hệ Nhật ký chăm sóc (`plant_journals` & `journal_photos`)
**Mục tiêu:** Cho phép người dùng ghi lại quá trình phát triển, tình trạng sức khỏe của từng cây và đính kèm ảnh minh họa.

- **Database Migration:**
  - `backend/src/main/resources/db/migration/V5__plant_journals.sql`
  - Bảng `plant_journals`: Lưu `user_plant_id`, `owner_user_id`, `care_task_id` (tùy chọn), `entry_date`, `log_type` (`growth`, `watering`, `fertilizing`, `pest`, `pruning`, `other`), `health_status` (`healthy`, `warning`, `critical`), `title`, `note`.
  - Bảng `journal_photos`: Lưu ảnh đính kèm theo từng bản ghi nhật ký với kiểm tra định dạng/kích thước.
- **Backend (`vn.goplant.backend.journal`):**
  - `PlantJournalController.java`, `PlantJournalService.java` (cùng `ImageValidator.java` dùng chung cho kiểm tra ảnh).
  - Các API chính: `GET /api/v1/plants/{plantId}/journals`, `POST /api/v1/plants/{plantId}/journals`, `DELETE /api/v1/journals/{journalId}`, `POST /api/v1/journals/{journalId}/photos`, `GET /api/v1/journal-photos/{photoId}`, `DELETE /api/v1/journal-photos/{photoId}`.
- **Frontend (`GOPLANTT`):**
  - Bổ sung API và state tại `GOPLANTT/src/services/api.ts`, `GOPLANTT/src/features/journal/JournalStore.tsx` và giao diện tại `GOPLANTT/src/features/journal/JournalScreens.tsx`.

### 1.3. Bảo mật tài khoản & Cơ chế Refresh Token
**Mục tiêu:** Hoàn thiện luồng bảo mật tài khoản và duy trì phiên đăng nhập an toàn cho ứng dụng di động.

- **Database Migration:**
  - `backend/src/main/resources/db/migration/V6__auth_security_and_refresh_tokens.sql`
  - Mở rộng `account_action_tokens` hỗ trợ `PASSWORD_RESET` (bên cạnh `EMAIL_VERIFICATION`).
  - Tạo bảng `refresh_tokens` lưu token đã băm (`token_hash`), thời hạn, trạng thái thu hồi (`revoked_at`) và chuỗi xoay vòng token (`replaced_by_token_id`).
- **Backend (`vn.goplant.backend.auth`):**
  - `AuthController.java`, `AuthService.java`, `VerificationEmailSender.java`, `SecurityConfig.java`.
  - Bổ sung các API:
    - `POST /api/v1/auth/change-password` (xác thực mật khẩu cũ + cập nhật mật khẩu mới).
    - `POST /api/v1/auth/forgot-password` & `POST /api/v1/auth/reset-password` (gửi email & đặt lại mật khẩu qua token).
    - `POST /api/v1/auth/refresh` (cấp lại access token + refresh token rotation) & `POST /api/v1/auth/logout` (thu hồi refresh token).
- **Frontend (`GOPLANTT`):**
  - Cập nhật cơ chế lưu/tự động làm mới token trong `GOPLANTT/src/services/api.ts`, `GOPLANTT/src/features/auth/AuthSession.tsx` và màn hình tài khoản/đổi mật khẩu/quên mật khẩu trong `GOPLANTT/src/features/auth/AuthScreens.tsx`, `GOPLANTT/src/features/account/AccountScreens.tsx`.

---

## Giai đoạn 2: Chuẩn hóa dữ liệu & Nâng cao chất lượng

### 2.1. Chuẩn hóa dữ liệu Catalog cây (Phương án A)
**Mục tiêu:** Loại bỏ dữ liệu loài cây hardcode ở Frontend, đưa toàn bộ thông tin chi tiết vào PostgreSQL để quản lý tập trung qua API.

- **Database Migration & Seeder:**
  - `backend/src/main/resources/db/migration/V7__plant_catalog_details.sql`: Bổ sung 8 cột vào `plant_catalog` gồm `difficulty`, `light_requirement`, `water_frequency_days`, `temperature_range`, `toxicity_warning`, `overview`, `origin`, `morphology`; đồng thời backfill dữ liệu `origin`, `morphology`, `overview`, `toxicity_warning` cho 21 loài cây mẫu (các cột chưa có số liệu giữ `NULL` theo Phương án A).
  - `PopularPlantCatalogSeeder.java`: Cập nhật để seed đầy đủ các trường thông tin khi khởi tạo database mới.
- **Backend & Frontend:**
  - `PlantCatalogController.java`: Mở rộng `Plant` record, `PlantRequest`, `POST /api/v1/admin/catalog/plants` và bổ sung `PUT /api/v1/admin/catalog/plants/{id}`.
  - Frontend: Cập nhật `GOPLANTT/src/services/api.ts`, `GOPLANTT/src/features/plants/PlantDataStore.tsx` để lấy dữ liệu động từ API; xóa file hardcode `GOPLANTT/src/features/plants/speciesDetails.ts`; mở rộng form nhập liệu cho Admin tại `GOPLANTT/src/features/account/AdminPlantCatalogScreen.tsx`.

### 2.2. Pagination & Server-side Filtering
**Mục tiêu:** Tránh tải toàn bộ danh sách khi dữ liệu tăng lên, hỗ trợ phân trang và tìm kiếm/lọc phía server.

- Tạo `backend/src/main/java/vn/goplant/backend/config/PageResponse.java` với cấu trúc chuẩn: `{ items, page, size, totalElements, totalPages }` (mặc định `page=0`, `size=20`, giới hạn tối đa `100`).
- Cập nhật `GET /api/v1/catalog/plants` (`PlantCatalogController.java`): Hỗ trợ `page`, `size`, `q` (tìm theo tên thường gọi / tên khoa học), `category`.
- Cập nhật `GET /api/v1/plants` (`GardenController.java`): Hỗ trợ `page`, `size`, `q`, `gardenId`.
- Cập nhật `fetchCatalogPlants` và `fetchOwnedPlants` trong `GOPLANTT/src/services/api.ts` và `PlantDataStore.tsx`.

### 2.3. OpenAPI (Swagger UI) & Testing Suite
**Mục tiêu:** Tự động sinh tài liệu API trực quan và thiết lập bộ kiểm thử tự động cho các luồng bảo mật & nghiệp vụ quan trọng.

- **OpenAPI / Swagger UI:**
  - Thêm dependency `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.8` vào `backend/pom.xml`.
  - Tạo `backend/src/main/java/vn/goplant/backend/config/OpenApiConfig.java` cấu hình metadata API và `bearerAuth` (JWT).
  - Cập nhật `SecurityConfig.java` mở quyền truy cập `/swagger-ui.html`, `/swagger-ui/**`, `/v3/api-docs/**`.
- **Testing Suite (`backend/src/test/java`):**
  - Tạo `backend/src/test/java/vn/goplant/backend/ApiSecurityAndFlowTest.java` dùng `@SpringBootTest(webEnvironment = WebEnvironment.MOCK)` + `MockMvc` (mock `JdbcTemplate`, `PlatformTransactionManager`, `VerificationEmailSender`) để kiểm tra:
    - Truy cập công khai OpenAPI (`/v3/api-docs`) và phân trang/tìm kiếm catalog (`/api/v1/catalog/plants`).
    - Validate dữ liệu và tạo tài khoản đăng ký (`/api/v1/auth/register`).
    - Bảo vệ xác thực (`401 Unauthorized` khi thiếu JWT ở `/api/v1/gardens`, `/api/v1/plants`).
    - Phân quyền vai trò (`403 Forbidden` khi tài khoản `member` gọi `/api/v1/admin/catalog/plants`).
    - Bảo vệ quyền sở hữu dữ liệu vườn & cây (`200 OK` khi truy vấn cây của chính mình, `404 Not Found` khi xóa vườn không thuộc sở hữu).

---

## Kết quả kiểm chứng sau khi hoàn tất

- **Backend (`backend`):** Chạy `mvn -q test` thành công (**exit code 0**), toàn bộ test trong `ApiSecurityAndFlowTest` pass.
- **Frontend (`GOPLANTT`):** Chạy `.\node_modules\.bin\tsc.cmd --noEmit` thành công (**exit code 0**), không có lỗi biên dịch TypeScript.
- **Database Migrations:** Đã có đầy đủ chuỗi migration từ `V1` đến `V7` trong `backend/src/main/resources/db/migration/`.
