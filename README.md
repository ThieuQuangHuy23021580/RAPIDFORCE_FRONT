# RapidForce Frontend

RapidForce Frontend là giao diện web tĩnh cho hệ thống tạo mô hình 3D bằng AI. Ứng dụng cho phép người dùng trò chuyện với AI, tải ảnh 2D lên để sinh mô hình 3D định dạng `GLB/OBJ`, xem trước mô hình trực tiếp trên trình duyệt, đăng nhập/đăng ký tài khoản và quản lý các mô hình đã lưu.

Dự án hiện được xây dựng bằng HTML, CSS và JavaScript thuần, không cần bước build frontend. Các API xử lý nặng như sinh mô hình 3D, xác thực, lưu trữ mô hình và chat AI được cung cấp bởi backend FastAPI chạy riêng.

## Tính năng chính

- Trang giới thiệu sản phẩm RapidForce.
- Giao diện chat AI với lịch sử hội thoại trong phiên làm việc.
- Chế độ `Render 3D` trong khung chat để tải ảnh và gọi backend sinh mô hình 3D.
- Preview mô hình `GLB` trực tiếp bằng `model-viewer`.
- Tải xuống mô hình sau khi generate.
- Đăng ký và đăng nhập người dùng qua API backend.
- Lưu mô hình đã tạo vào backend/cloud storage khi người dùng đã đăng nhập.
- Trang `My Models` để xem, tải xuống và xóa các mô hình đã lưu.
- Giới hạn lưu trữ 5 mô hình cho mỗi tài khoản theo logic frontend/backend hiện tại.
- Sidebar điều hướng giữa Chat và My Models.
- Hỗ trợ chạy như static site bằng `python -m http.server`.

## Kiến trúc tổng quan

```text
Browser
  |
  |-- welcome_page.html      Trang giới thiệu
  |-- chat.html              Chat AI + Render 3D
  |-- login_view.html        Đăng nhập
  |-- register_view.html     Đăng ký
  |-- my-models.html         Quản lý model đã lưu
  |
  |-- http://localhost:8000  Backend 3D/Auth/Models
  |-- http://localhost:8001  Backend Chat AI/RAG
```

Backend được tách thành 2 service:

- `localhost:8000`: xử lý generate 3D, lưu model, đăng nhập/đăng ký, user và model.
- `localhost:8001`: xử lý chat AI Qwen3 và RAG.

Frontend không chạy trực tiếp model AI. Toàn bộ tác vụ nặng được gọi qua HTTP API.

## Công nghệ sử dụng

- HTML5.
- CSS3.
- JavaScript thuần.
- Google Fonts: `Space Grotesk`, `Manrope`.
- Google Material Symbols cho icon.
- `@google/model-viewer` để xem trước file `GLB`.
- Browser `localStorage` để lưu trạng thái đăng nhập phía client.
- FastAPI backend ở các port `8000` và `8001`.

## Cấu trúc thư mục

```text
RAPIDFORCE_FRONT/
  chat.html
  welcome_page.html
  login_view.html
  register_view.html
  my-models.html
  FRONTEND_API_USAGE.md
  RUN_FRONTEND.md
  README.md
  scripts/
    chat.js
    my-models.js
    shared.js
    generator.js
    remove_background.js
  styles/
    chat.css
    common.css
    generator.css
    my-models.css
    remove_background.css
    shared.css
    welcome_page.css
  login_view.css
  register_view.css
  gallery.css
  my_model.css
  welcome_page.css
```

Một số file CSS đang tồn tại ở cả thư mục gốc và `styles/`. Các trang chính hiện ưu tiên CSS trong `styles/` với một số trang auth dùng CSS ở thư mục gốc.

## Các trang chính

### `welcome_page.html`

Trang landing page của RapidForce. Trang này giới thiệu sản phẩm, mô tả quy trình upload ảnh 2D, AI synthesis và download mô hình 3D. Nút bắt đầu chuyển người dùng sang `chat.html`.

### `chat.html`

Trang ứng dụng chính. Có 2 chế độ:

- `Chat`: gửi hội thoại tới backend chat ở `http://localhost:8001/chat`.
- `Render 3D`: người dùng chọn ảnh, nhập mô tả, bật/tắt remove background, rồi gọi backend 3D ở `http://localhost:8000/generate`.

Khi backend trả về file `GLB`, frontend tạo `Blob URL` và hiển thị mô hình bằng `model-viewer`. Nếu người dùng đã đăng nhập, nút lưu trữ sẽ gọi `/generate/store` để lưu model vào backend.

### `login_view.html`

Trang đăng nhập. Form gửi `email` và `password` tới:

```text
POST http://localhost:8000/auth/login
```

Khi đăng nhập thành công, thông tin user được lưu vào `localStorage`:

- `rapidforce_auth_logged_in`
- `rapidforce_auth_user`

### `register_view.html`

Trang đăng ký tài khoản mới. Form gửi thông tin user tới:

```text
POST http://localhost:8000/auth/register
```

Sau khi đăng ký thành công, frontend cũng tự lưu trạng thái đăng nhập và chuyển về `chat.html`.

### `my-models.html`

Trang quản lý các mô hình đã lưu. Trang này đọc user từ `localStorage`, sau đó gọi:

```text
GET http://localhost:8000/users/{user_id}/models
```

Người dùng có thể:

- xem danh sách model đã lưu;
- xem dung lượng và thời gian tạo;
- tải model xuống;
- xóa model bằng endpoint `DELETE /users/{user_id}/models/{model_id}`;
- quay lại tạo model mới.

Trang này cũng có chế độ nhúng qua query `?embed=1`, được dùng bên trong iframe của `chat.html`.

## Luồng người dùng

### Luồng tạo model 3D không đăng nhập

1. Người dùng mở `chat.html`.
2. Chọn chế độ `Render 3D`.
3. Chọn ảnh đầu vào.
4. Nhập mô tả.
5. Bấm gửi.
6. Frontend gọi `POST /generate`.
7. Backend trả file `GLB/OBJ`.
8. Frontend hiển thị preview nếu là `GLB` và cung cấp nút download.

Người dùng khách chỉ tạo và tải xuống model, không lưu model vào kho cá nhân.

### Luồng tạo và lưu model khi đã đăng nhập

1. Người dùng đăng nhập qua `login_view.html`.
2. Frontend lưu user vào `localStorage`.
3. Người dùng tạo model trong `chat.html`.
4. Sau khi generate thành công, frontend hiển thị nút lưu trữ.
5. Trước khi lưu, frontend kiểm tra số model đã lưu của user.
6. Nếu còn slot, frontend gọi `POST /generate/store`.
7. Trang `My Models` có thể reload để hiển thị model mới.

### Luồng chat AI

1. Người dùng chọn tab `Chat`.
2. Nhập câu hỏi.
3. Frontend thêm message vào `conversationHistory`.
4. Frontend gọi `POST http://localhost:8001/chat`.
5. Câu trả lời được render vào khung chat.

## API backend cần có

### Service 3D/Auth/Models - port `8000`

| Chức năng | Method | Endpoint |
| --- | --- | --- |
| Health check | `GET` | `/health` |
| Generate model | `POST` | `/generate` |
| Generate và lưu model | `POST` | `/generate/store` |
| Đăng ký | `POST` | `/auth/register` |
| Đăng nhập | `POST` | `/auth/login` |
| Danh sách model | `GET` | `/models` |
| Chi tiết model | `GET` | `/models/{model_id}` |
| Danh sách user | `GET` | `/users` |
| Chi tiết user | `GET` | `/users/{user_id}` |
| Model theo user | `GET` | `/users/{user_id}/models` |
| Xóa model của user | `DELETE` | `/users/{user_id}/models/{model_id}` |

### Service Chat AI/RAG - port `8001`

| Chức năng | Method | Endpoint |
| --- | --- | --- |
| Health check | `GET` | `/health` |
| Chat AI | `POST` | `/chat` |
| Re-index RAG | `POST` | `/rag/index` |
| Thống kê RAG | `GET` | `/rag/stats` |

Chi tiết request/response của từng endpoint được mô tả trong `FRONTEND_API_USAGE.md`.

## Cách chạy frontend

Yêu cầu: máy có Python hoặc một static server bất kỳ.

Chạy tại thư mục dự án:

```bash
python -m http.server 5500
```

Mở trình duyệt:

```text
http://localhost:5500/welcome_page.html
```

Hoặc vào trực tiếp ứng dụng chính:

```text
http://localhost:5500/chat.html
```

Nếu port `5500` đã bị chiếm, có thể đổi sang port khác:

```bash
python -m http.server 5600
```

## Cách chạy backend liên quan

Frontend cần backend chạy trước nếu muốn dùng đầy đủ tính năng.

Service 3D/Auth/Models:

```bash
.\.venv\Scripts\python.exe -m uvicorn fastapi_app:app --host 0.0.0.0 --port 8000
```

Service Chat AI/RAG:

```bash
.\.venv\Scripts\python.exe -m qwen3
```

Kiểm tra:

```text
http://localhost:8000/docs
http://localhost:8000/health
http://localhost:8001/docs
http://localhost:8001/health
```

## Cấu hình endpoint

Các URL API hiện đang được hard-code trong JavaScript:

```js
const API_3D = "http://localhost:8000";
const API_CHAT = "http://localhost:8001";
const API_AUTH = "http://localhost:8000";
```

Các hằng này nằm chủ yếu trong:

- `scripts/chat.js`
- `scripts/my-models.js`
- script inline trong `login_view.html`
- script inline trong `register_view.html`

Khi deploy lên môi trường khác, cần đổi các URL này sang domain backend thực tế hoặc tách thành file cấu hình riêng.

## Dữ liệu lưu ở trình duyệt

Frontend dùng `localStorage` để lưu trạng thái đăng nhập:

| Key | Ý nghĩa |
| --- | --- |
| `rapidforce_auth_logged_in` | Chuỗi `"true"` hoặc `"false"` cho biết trạng thái đăng nhập |
| `rapidforce_auth_user` | JSON chứa thông tin user backend trả về |

Khi đăng xuất, frontend xóa `rapidforce_auth_user` và đặt trạng thái đăng nhập về `false`.

## Render và lưu mô hình 3D

Khi generate model, frontend gửi `FormData` gồm:

- `image`: file ảnh đầu vào.
- `remove_background_flag`: bật/tắt xóa nền.
- `foreground_ratio`: mặc định `0.85`.
- `mc_resolution`: mặc định `256`.
- `output_format`: mặc định `glb`.

Với lưu trữ model, frontend gọi `/generate/store` và gửi thêm:

- `compress_draco`: mặc định `true`.
- `user_id` hoặc `user_name`.
- `image_url`: ảnh đầu vào dạng Data URL để làm thumbnail nhẹ cho My Models.

## Lưu ý CORS

Frontend thường chạy ở `http://localhost:5500`, còn backend chạy ở `8000` và `8001`. Vì khác origin, backend FastAPI cần bật CORS cho origin frontend.

Ví dụ:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Trong lúc phát triển, có thể mở rộng `allow_origins` theo port frontend đang dùng.

## Tài liệu liên quan

- `FRONTEND_API_USAGE.md`: tài liệu chi tiết về API backend và ví dụ gọi API.
- `RUN_FRONTEND.md`: ghi chú nhanh các lệnh chạy frontend và kiểm tra port.

## Gợi ý phát triển tiếp

- Tách cấu hình API URL ra file config dùng chung.
- Chuẩn hóa encoding UTF-8 cho toàn bộ HTML/CSS/JS để tránh lỗi hiển thị tiếng Việt.
- Thêm xử lý token/session thật nếu backend có JWT hoặc cookie auth.
- Thêm trạng thái loading/error nhất quán cho mọi request API.
- Thêm preview cho định dạng `OBJ` nếu cần hỗ trợ sâu hơn.
- Thêm test E2E cho các luồng đăng nhập, generate, lưu model và xóa model.
