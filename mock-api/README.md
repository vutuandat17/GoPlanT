# GoPlant Mock API

## Mục đích

Mock API cung cấp dữ liệu cây trồng mẫu để thực hành gọi và kiểm tra REST API bằng Postman. Đây là dịch vụ độc lập, không tích hợp vào ứng dụng frontend GoPlant.

## Công nghệ

- JSON Server `0.17.4`
- Node.js và npm để chạy `npx`

JSON Server được gọi trực tiếp qua `npx`; không được cài vào project Expo.

## Cấu trúc thư mục

```text
mock-api/
├── db.json
└── README.md
```

## Dữ liệu

`db.json` có tài nguyên `plants` với ba bản ghi minh họa. Mỗi cây có các trường:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | number | Định danh duy nhất của bản ghi mẫu |
| `name` | string | Tên hiển thị |
| `scientificName` | string | Tên khoa học |
| `location` | string | Vị trí đặt cây trong dữ liệu minh họa |

Dữ liệu này không thuộc người dùng thật và không chứa thông tin sức khỏe, chỉ số môi trường hoặc dữ liệu cảm biến.

## Khởi chạy trên Windows PowerShell

Mở PowerShell tại thư mục `mock-api`:

```powershell
cd C:\Apps\Projects\GoPlant\mock-api
npx.cmd --yes json-server@0.17.4 --watch db.json --port 3000
```

Lần chạy đầu tiên, `npx` có thể tải JSON Server phiên bản `0.17.4` để thực thi. Server lắng nghe tại:

```text
http://localhost:3000
```

Để dừng server, nhấn `Ctrl + C` trong cửa sổ PowerShell đang chạy server.

## Endpoint

JSON Server tự tạo REST endpoint từ khóa cấp cao nhất `plants` trong `db.json`:

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/plants` | Lấy danh sách cây |
| GET | `/plants/1` | Lấy cây có ID `1` |
| POST | `/plants` | Tạo bản ghi cây |
| PUT | `/plants/1` | Thay thế bản ghi cây có ID `1` |
| PATCH | `/plants/1` | Cập nhật một phần bản ghi cây có ID `1` |
| DELETE | `/plants/1` | Xóa bản ghi cây có ID `1` |

Ví dụ URL đầy đủ:

```text
GET http://localhost:3000/plants
GET http://localhost:3000/plants/1
```

## Giới hạn

- Đây chỉ là Mock Backend phục vụ phát triển và thực hành; không phải backend chính thức của GoPlant.
- Dữ liệu được lưu trong `db.json`; JSON Server có thể ghi thay đổi vào file khi nhận request ghi. Hãy dùng bản dữ liệu thử nghiệm và sao lưu nếu cần giữ nguyên dữ liệu ban đầu.
- Frontend chưa được kết nối với dịch vụ này. Chưa có xác thực, phân quyền, database PostgreSQL, bảo mật production hoặc quy tắc nghiệp vụ đầy đủ.
