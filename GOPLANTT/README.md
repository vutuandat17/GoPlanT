# GoPlant Frontend

Ứng dụng Expo/React Native kết nối backend Spring Boot tại `../backend`. Tài khoản, danh mục cây, khu vườn, cây sở hữu và yêu thích được đọc/ghi qua API; ứng dụng không tạo dữ liệu giả khi máy chủ chưa sẵn sàng.

## Chạy ứng dụng

1. Khởi động Docker Desktop, PostgreSQL và backend theo hướng dẫn trong [README dự án](../README.md) hoặc [`../backend/README.md`](../backend/README.md).
2. Sao chép `.env.example` thành `.env`. Với cấu hình dự án hiện tại, đặt `EXPO_PUBLIC_API_URL=http://10.0.2.2:8082` cho Android emulator. Web và iOS simulator có thể dùng `http://localhost:8082`.
3. Bật Android Emulator, sau đó cài package và mở app:

```powershell
npm ci
npm run android
```

Giữ Metro/Expo và backend chạy trong các cửa sổ terminal. `10.0.2.2` là địa chỉ đặc biệt để Android emulator gọi dịch vụ đang chạy trên máy tính. Đổi URL trong `.env` nếu backend dùng cổng khác; khởi động lại Expo sau khi sửa biến môi trường.

## Tài khoản quản trị

Backend giữ định danh quản trị hiện có `admin@goplant.test`. Bootstrap chỉ tạo tài khoản nếu email chưa tồn tại và không ghi đè mật khẩu/tài khoản đã có. Sau khi đăng nhập admin, mở **Tài khoản → Quản lý danh mục cây** để thêm và xuất bản cây mới; cần cung cấp tên khoa học cùng ít nhất một thông tin nguồn tham khảo.

## API hiện được frontend sử dụng

- Đăng ký, xác minh email, đăng nhập và tải tài khoản hiện tại.
- Danh mục cây đã duyệt, tìm kiếm, yêu thích.
- Quản trị viên có thể thêm cây vào danh mục chung kèm nguồn tham khảo.
- Tạo và xem khu vườn; thêm, sửa và xóa cây sở hữu.
- Access token được lưu bằng Expo SecureStore trên thiết bị; trình duyệt dùng local storage.

Backend hiện chưa cung cấp API cho nhật ký chăm sóc, lịch chăm sóc, thời tiết, cảm biến, cập nhật hồ sơ cá nhân, đổi/khôi phục mật khẩu, xuất dữ liệu hoặc xóa tài khoản. Các màn tương ứng chỉ hiển thị dữ liệu trống hoặc trạng thái nghiệp vụ; không xác nhận thao tác chưa được lưu.
