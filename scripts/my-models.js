/* ===========================
   RapidForce — My Models Scripts
   =========================== */

const API_3D = "http://localhost:8000";
const AUTH_STORAGE_KEY = "rapidforce_auth_logged_in";
const AUTH_USER_KEY = "rapidforce_auth_user";
const STORAGE_LIMIT = 5;

document.addEventListener("DOMContentLoaded", () => {
  initMyModelsPage();
});

async function initMyModelsPage() {
  await reloadMyModelsPage();
}

async function reloadMyModelsPage() {
  const statusEl = document.getElementById("modelsStatus");
  const gridEl = document.getElementById("modelsGrid");
  if (!statusEl || !gridEl) return;

  const loggedIn = localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  if (!loggedIn) {
    renderModels([], { gridEl });
    showStatus(statusEl, "Đăng nhập để xem các model đã lưu trữ.");
    return;
  }

  const user = getCurrentAuthUser();
  if (!user) {
    renderModels([], { gridEl });
    showStatus(statusEl, "Không tìm thấy thông tin user. Vui lòng đăng nhập lại.");
    return;
  }

  if (!user.user_id) {
    renderModels([], { gridEl });
    showStatus(statusEl, "Thiếu user_id — không thể tải hoặc xóa model. Vui lòng đăng nhập lại.");
    return;
  }

  showStatus(statusEl, "Đang tải danh sách model...");
  try {
    const models = await fetchStoredModels(user);
    renderModels(models, { gridEl });
    showStatus(statusEl, models.length ? "" : "Chưa có model nào được lưu.");
  } catch (_) {
    renderModels([], { gridEl });
    showStatus(statusEl, "Không tải được danh sách model từ backend.");
  }
}

function showStatus(statusEl, message) {
  const text = message ? String(message).trim() : "";
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

async function readApiErrorMessage(response) {
  const text = await response.text();
  if (!text) return "";
  try {
    const j = JSON.parse(text);
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((d) => (typeof d === "string" ? d : d.msg || JSON.stringify(d)))
        .join(" ");
    }
    if (j.detail != null) return String(j.detail);
  } catch (_) {
    /* plain text */
  }
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

function formatDeleteFailureMessage(status, detailText) {
  const detail = (detailText || "").trim();
  if (status === 404) {
    return (
      "Backend trả 404 — thường là chưa có route DELETE xóa model (FastAPI: {\"detail\":\"Not Found\"}). " +
      "Hãy thêm endpoint đúng tài liệu: DELETE /users/{user_id}/models/{model_id} và xem lại http://localhost:8000/docs. " +
      (detail ? `(Chi tiết: ${detail})` : "")
    );
  }
  if (status === 403) {
    return (
      "Không được phép xóa (403). Model có thể không thuộc user này hoặc chưa gán user_id trên server. " +
      (detail ? `Chi tiết: ${detail}` : "")
    );
  }
  if (status === 405) {
    return "Phương thức DELETE không được hỗ trợ tại URL này (405). Cần endpoint xóa đúng trên backend.";
  }
  return detail ? `Lỗi ${status}: ${detail}` : `Lỗi HTTP ${status}`;
}

function getCurrentAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function fetchStoredModels(user) {
  const userId = user?.user_id ? String(user.user_id) : "";
  if (userId) {
    const response = await fetch(`${API_3D}/users/${encodeURIComponent(userId)}/models`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user models: ${response.status}`);
    }
    const payload = await response.json();
    const rawItems = Array.isArray(payload)
      ? payload
      : payload?.models || payload?.items || payload?.data || [];
    const list = rawItems.map(normalizeModel).filter((item) => !!item.downloadUrl);
    return sortNewestFirst(applySequentialFallbackNames(list));
  }

  // Fallback only when old auth payload misses user_id.
  const response = await fetch(`${API_3D}/models?limit=200&offset=0`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }
  const payload = await response.json();
  const rawItems = Array.isArray(payload)
    ? payload
    : payload?.models || payload?.items || payload?.data || [];
  const userName = user?.user_name || user?.email || "";

  const list = rawItems
    .filter((item) => {
      if (item?.user_id && user?.user_id) {
        return String(item.user_id) === String(user.user_id);
      }
      if (userName && item?.user_name) {
        return String(item.user_name) === String(userName);
      }
      return false;
    })
    .map(normalizeModel)
    .filter((item) => !!item.downloadUrl);

  return sortNewestFirst(applySequentialFallbackNames(list));
}

function parseSizeMbFromItem(item) {
  const toNum = (v) => {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    const s = String(v).trim().replace(",", ".");
    return parseFloat(s);
  };

  const mbRaw =
    item.size_mb ?? item.sizeMB ?? item.file_size_mb ?? item.model_size_mb ?? item.sizeMb;
  let mb = toNum(mbRaw);
  if (Number.isFinite(mb) && mb > 0) return mb;

  const byteRaw =
    item.size_bytes ?? item.file_size_bytes ?? item.bytes ?? item.file_size ?? item.size;
  const bytes = toNum(byteRaw);
  if (Number.isFinite(bytes) && bytes > 0) {
    if (bytes >= 1024 * 1024) return bytes / (1024 * 1024);
    if (!Number.isInteger(bytes) && bytes < 1024) return bytes;
    if (Number.isInteger(bytes) && bytes >= 1024) return bytes / (1024 * 1024);
    if (Number.isInteger(bytes) && bytes < 1024) return bytes / (1024 * 1024);
  }

  return 0;
}

function normalizeModel(raw, index) {
  const item = raw || {};
  const createdAt = item.created_at || item.createdAt || item.updated_at || "";
  const createdAtTs = createdAt ? Date.parse(createdAt) : NaN;
  const explicitName = [item.name, item.model_name, item.title, item.file_name].find(
    (x) => x != null && String(x).trim() !== ""
  );
  return {
    id:
      item.id ||
      item.model_id ||
      item.generation_id ||
      item.file_id ||
      `MODEL-${index + 1}`,
    name: explicitName ? String(explicitName).trim() : "",
    status: item.status || item.state || "Rendered",
    sizeMb: parseSizeMbFromItem(item),
    createdAt,
    createdAtTs: Number.isFinite(createdAtTs) ? createdAtTs : 0,
    previewUrl: item.thumbnail_url || item.preview_url || item.image_url || "",
    downloadUrl:
      item.download_url ||
      item.model_url ||
      item.file_url ||
      item.glb_url ||
      item.url ||
      "",
  };
}

/**
 * Khi API không trả tên: đặt Model 1, Model 2, … theo thứ tự tạo (cũ → mới),
 * để model mới luôn là số tiếp theo, không bị reset thành Model 1.
 */
function applySequentialFallbackNames(models) {
  const order = [...models].sort((a, b) => {
    const ta = a.createdAtTs || 0;
    const tb = b.createdAtTs || 0;
    if (ta !== tb) return ta - tb;
    const na = Number(a.id);
    const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });
  const seqById = new Map();
  order.forEach((m, i) => seqById.set(m.id, i + 1));
  return models.map((m) => ({
    ...m,
    name: m.name && m.name.trim() !== "" ? m.name : `Model ${seqById.get(m.id)}`,
  }));
}

function sortNewestFirst(models) {
  return [...models].sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
}

function renderModels(models, { gridEl }) {
  const cardsHtml = models.map(renderModelCard).join("");
  gridEl.innerHTML = `${cardsHtml}${renderEmptySlotCard(models.length)}`;
  bindDownloadButtons();
  bindDeleteButtons();
  bindNewGeneration();
  updateStorageBar(models.length);
}

function canDeleteModel(model) {
  const id = model.id;
  if (id == null || id === "") return false;
  const s = String(id);
  if (/^MODEL-\d+$/i.test(s)) return false;
  return true;
}

function renderModelCard(model) {
  const imageBlock = model.previewUrl
    ? `<img alt="${escapeHtml(model.name)}" src="${escapeHtml(model.previewUrl)}" />`
    : `<div class="model-card__image--placeholder">
         <span class="material-symbols-outlined">view_in_ar</span>
       </div>`;

  const deleteBtn = canDeleteModel(model)
    ? `<button type="button" class="model-card__delete" data-action="delete-model" data-model-id="${escapeHtml(String(model.id))}" title="Xóa model" aria-label="Xóa model">
         <span class="material-symbols-outlined" style="font-size:1.25rem">delete</span>
       </button>`
    : "";

  return `
    <div class="model-card glass-panel">
      <div class="model-card__image">
        ${imageBlock}
        <span class="model-card__badge">${escapeHtml(model.status)}</span>
      </div>
      <div class="model-card__footer">
        <div>
          <h3 class="model-card__name headline-font">${escapeHtml(model.name)}</h3>
          <div class="model-card__meta">
            <span>${escapeHtml(formatCreatedAt(model.createdAt))}</span>
            <span>${escapeHtml(formatSizeKb(model.sizeMb))}</span>
          </div>
        </div>
        <div class="model-card__actions">
          ${deleteBtn}
          <button type="button" class="model-card__download" data-action="download" data-url="${escapeHtml(model.downloadUrl)}" title="Tải model">
            <span class="material-symbols-outlined" style="font-size:1.25rem">download</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function formatCreatedAt(value) {
  if (!value) return "Thời gian: --";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Thời gian: --";
  return `Thời gian: ${date.toLocaleString("vi-VN")}`;
}

function formatSizeKb(valueMb) {
  const mb = Number(valueMb);
  if (!Number.isFinite(mb) || mb <= 0) return "Kích thước: --";
  const kb = mb * 1024;
  if (kb < 0.01) return "Kích thước: < 0.01 KB";
  const formatted = kb.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `Kích thước: ${formatted} KB`;
}

function renderEmptySlotCard(count) {
  const remaining = Math.max(STORAGE_LIMIT - count, 0);
  return `
    <div class="model-card--empty" id="newGenerationSlot">
      <div class="model-card--empty__icon">
        <span class="material-symbols-outlined">add</span>
      </div>
      <h3 class="model-card--empty__title headline-font">New Generation</h3>
      <p class="model-card--empty__subtitle">${remaining} Slots Remaining</p>
    </div>
  `;
}

function bindDownloadButtons() {
  document.querySelectorAll("[data-action='download']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.url || "";
      if (!url) return;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "";
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  });
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-action='delete-model']").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const modelId = btn.dataset.modelId || "";
      const user = getCurrentAuthUser();
      if (!user?.user_id || !modelId) return;
      if (!confirm("Xóa model này khỏi kho lưu trữ?")) return;

      btn.disabled = true;
      const statusEl = document.getElementById("modelsStatus");
      const prev = statusEl?.textContent;
      if (statusEl) showStatus(statusEl, "Đang xóa model...");

      try {
        const response = await fetch(
          `${API_3D}/users/${encodeURIComponent(String(user.user_id))}/models/${encodeURIComponent(modelId)}`,
          { method: "DELETE" }
        );
        if (!response.ok) {
          const detailText = await readApiErrorMessage(response);
          throw new Error(formatDeleteFailureMessage(response.status, detailText));
        }
        await reloadMyModelsPage();
      } catch (err) {
        if (statusEl) showStatus(statusEl, prev || "");
        alert(err?.message || "Không xóa được model.");
        btn.disabled = false;
      }
    });
  });
}

function bindNewGeneration() {
  const emptySlot = document.getElementById("newGenerationSlot");
  if (!emptySlot) return;
  const isEmbed = document.documentElement.classList.contains("embed-mode");

  emptySlot.addEventListener("click", () => {
    if (isEmbed && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "rapidforce:navigate", target: "chat" }, "*");
      return;
    }
    window.location.href = "./chat.html";
  });
}

function updateStorageBar(currentCount) {
  const fill = document.getElementById("storageBarFill");
  const countEl = document.getElementById("storageCount");
  if (!fill || !countEl) return;

  const used = Math.max(0, Math.min(Number(currentCount) || 0, STORAGE_LIMIT));
  const percent = Math.round((used / STORAGE_LIMIT) * 100);
  countEl.textContent = `${used} of ${STORAGE_LIMIT}`;
  fill.dataset.percent = String(percent);
  fill.style.width = "0%";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.width = `${percent}%`;
    });
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
