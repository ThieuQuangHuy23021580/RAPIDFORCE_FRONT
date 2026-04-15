# Frontend Guide: Using RapidForce API

## Mục tiêu

File này hướng dẫn cách để một project frontend khác gọi API của `RapidForce` sau khi backend `FastAPI` đã được dựng bằng file `fastapi_app.py`.

Frontend có thể là:

- HTML + JavaScript thuần
- React
- Vue
- Angular
- Next.js

## 1. Backend cần chạy trước

Frontend không chạy trực tiếp model Python được. Trước tiên cần chạy API server:

```bash
uvicorn fastapi_app:app --host 0.0.0.0 --port 8000
```

Sau khi chạy:

- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

## 2. API hiện có

### `GET /health`

Dùng để kiểm tra backend còn hoạt động không.

Ví dụ response:

```json
{
  "status": "ok",
  "device": "cuda:0",
  "model": "stabilityai/TripoSR"
}
```

### `POST /generate`

Đây là endpoint chính để frontend gửi ảnh lên và nhận file 3D trả về.

#### Content-Type

`multipart/form-data`

#### Form fields

- `image`: file ảnh đầu vào
- `remove_background_flag`: `true` hoặc `false`
- `foreground_ratio`: số thực từ `0.5` đến `1.0`
- `mc_resolution`: một trong các giá trị:
  - `32`
  - `64`
  - `96`
  - `128`
  - `160`
  - `192`
  - `224`
  - `256`
  - `288`
  - `320`
- `output_format`: `glb` hoặc `obj`

#### Output

API trả trực tiếp file 3D:

- `glb` nếu `output_format=glb`
- `obj` nếu `output_format=obj`

Khuyến nghị:

- dùng `glb` nếu frontend muốn preview bằng `Three.js`
- dùng `obj` nếu project của bạn đang xử lý pipeline cũ đã quen với OBJ

## 3. Luồng tích hợp trong frontend

Luồng cơ bản:

1. Người dùng chọn ảnh
2. Frontend tạo `FormData`
3. Frontend gọi `POST /generate`
4. Nhận `Blob` trả về
5. Tạo URL từ blob
6. Cho phép tải file hoặc đưa vào viewer 3D

## 4. Ví dụ HTML + JS tối thiểu

### HTML

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RapidForce API Demo</title>
  </head>
  <body>
    <h1>RapidForce API Demo</h1>

    <input type="file" id="imageInput" accept="image/*" />
    <br /><br />

    <label>
      <input type="checkbox" id="removeBg" checked />
      Remove background
    </label>
    <br /><br />

    <label for="foregroundRatio">Foreground ratio:</label>
    <input type="number" id="foregroundRatio" value="0.85" min="0.5" max="1.0" step="0.05" />
    <br /><br />

    <label for="mcResolution">MC resolution:</label>
    <select id="mcResolution">
      <option value="128">128</option>
      <option value="256" selected>256</option>
      <option value="320">320</option>
    </select>
    <br /><br />

    <label for="outputFormat">Output format:</label>
    <select id="outputFormat">
      <option value="glb" selected>GLB</option>
      <option value="obj">OBJ</option>
    </select>
    <br /><br />

    <button id="generateBtn">Generate 3D</button>
    <p id="status"></p>
    <a id="downloadLink" style="display: none">Download result</a>

    <script src="./app.js"></script>
  </body>
</html>
```

### JavaScript

```js
const API_BASE_URL = "http://localhost:8000";

const imageInput = document.getElementById("imageInput");
const removeBg = document.getElementById("removeBg");
const foregroundRatio = document.getElementById("foregroundRatio");
const mcResolution = document.getElementById("mcResolution");
const outputFormat = document.getElementById("outputFormat");
const generateBtn = document.getElementById("generateBtn");
const statusText = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");

generateBtn.addEventListener("click", async () => {
  const file = imageInput.files[0];

  if (!file) {
    statusText.textContent = "Please choose an image first.";
    return;
  }

  const formData = new FormData();
  formData.append("image", file);
  formData.append("remove_background_flag", String(removeBg.checked));
  formData.append("foreground_ratio", foregroundRatio.value);
  formData.append("mc_resolution", mcResolution.value);
  formData.append("output_format", outputFormat.value);

  statusText.textContent = "Generating 3D model...";
  downloadLink.style.display = "none";

  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Generate failed");
    }

    const blob = await response.blob();
    const fileExt = outputFormat.value;
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = `rapidforce_result.${fileExt}`;
    downloadLink.textContent = `Download ${fileExt.toUpperCase()}`;
    downloadLink.style.display = "inline-block";

    statusText.textContent = "Done.";
  } catch (error) {
    statusText.textContent = `Error: ${error.message}`;
  }
});
```

## 5. Cách gọi từ React

Ví dụ ngắn:

```js
async function generateModel(file) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("remove_background_flag", "true");
  formData.append("foreground_ratio", "0.85");
  formData.append("mc_resolution", "256");
  formData.append("output_format", "glb");

  const response = await fetch("http://localhost:8000/generate", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Generate failed");
  }

  return await response.blob();
}
```

Bạn có thể:

- lưu blob để download
- tạo `URL.createObjectURL(blob)`
- đưa URL đó vào viewer `Three.js`

## 6. Preview bằng Three.js

Nếu backend trả về `glb`, frontend có thể preview bằng:

- `three`
- `GLTFLoader`

Luồng:

1. gọi API để lấy blob
2. tạo blob URL
3. load blob URL bằng `GLTFLoader`
4. render scene lên canvas

Khuyến nghị:

- ưu tiên `glb` thay vì `obj`
- `glb` gọn hơn và dễ load hơn trong trình duyệt

## 7. Kiểm tra backend trước khi gọi generate

Frontend nên gọi `GET /health` khi khởi động hoặc trước khi submit để biết backend có sẵn sàng không.

Ví dụ:

```js
async function checkHealth() {
  const response = await fetch("http://localhost:8000/health");
  if (!response.ok) {
    throw new Error("Backend is unavailable");
  }
  return await response.json();
}
```

## 8. Xử lý lỗi phía frontend

Frontend nên xử lý các trường hợp:

- chưa chọn file
- upload không phải ảnh
- backend chưa chạy
- backend trả lỗi `400`
- thời gian generate lâu

Khuyến nghị UI:

- disable nút submit trong lúc đang generate
- hiển thị trạng thái loading
- hiển thị lỗi rõ ràng cho người dùng

## 9. Vấn đề CORS

Nếu frontend chạy khác domain hoặc khác port với backend, bạn có thể gặp lỗi CORS.

Ví dụ:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8000`

Khi đó cần bật CORS trong `FastAPI`.

Ví dụ cấu hình:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Nếu frontend là HTML file chạy local hoặc project khác port, đây gần như là bước bắt buộc.

## 10. Những gì frontend cần biết, và không cần biết

Frontend cần biết:

- URL của backend
- endpoint `/health`
- endpoint `/generate`
- form fields cần gửi
- response là file 3D

Frontend không cần biết:

- `TSR.from_pretrained(...)`
- `model.extract_mesh(...)`
- `remove_background(...)`
- logic nội bộ của PyTorch

Những phần này nên nằm hoàn toàn ở backend Python.

## 11. Khuyến nghị tích hợp thực tế

Nếu project frontend của bạn là app thật, nên:

- dùng `glb` làm output mặc định
- thêm loading state
- thêm timeout/retry hợp lý
- lưu file vào storage riêng nếu cần dùng lại
- cân nhắc backend async nếu thời gian generate dài

## 12. Tóm tắt nhanh

Frontend chỉ cần nhớ:

1. Chạy backend `FastAPI`
2. Gọi `POST /generate` bằng `FormData`
3. Nhận file `.glb` hoặc `.obj`
4. Download hoặc preview bằng viewer 3D

Với frontend web hiện đại, lựa chọn tốt nhất là:

- backend trả `glb`
- frontend dùng `Three.js` để preview
