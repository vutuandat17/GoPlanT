# Báo cáo triển khai GoPlant V1

## Frontend

- Expo SDK 57 / React Native, điều hướng bằng Expo Router.
- Frontend sử dụng REST API cấu hình qua `EXPO_PUBLIC_API_URL`; không còn JSON Server hoặc mock authentication.
- JWT được xác thực lại qua `/api/v1/auth/me` khi khôi phục phiên. Token dùng Expo SecureStore trên thiết bị và local storage trên web.
- Danh mục cây, vườn, cây sở hữu và yêu thích lấy từ API. Khi không kết nối được máy chủ, ứng dụng hiển thị lỗi hoặc trạng thái trống và không tạo dữ liệu giả.

## Backend

- Spring Boot 3.5, Java 21, PostgreSQL, Flyway, JWT và role-based authorization.
- Có đăng ký/xác minh email/đăng nhập, danh mục cây có nguồn và quy trình duyệt, vườn, cây sở hữu và yêu thích.
- Quản trị viên giữ email `admin@goplant.test`; bootstrap dùng mật khẩu cấu hình qua biến môi trường và bỏ qua tài khoản đã tồn tại.

## Phạm vi chưa có API

Nhật ký, lịch chăm sóc, thời tiết/cảm biến, email delivery, khôi phục mật khẩu, thay đổi hồ sơ, lưu ảnh, xuất/xóa tài khoản và vận hành production chưa được cung cấp trong V1. Frontend không xác nhận các thao tác này là đã lưu.

## Kiểm tra

`npx tsc --noEmit` chạy thành công. `npm run lint` chưa chạy được vì dự án chưa có ESLint config và môi trường không cho phép tải gói ESLint khi Expo CLI thử cấu hình tự động.
