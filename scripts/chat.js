/* ===========================
   RapidForce — Chat Page Scripts
   =========================== */

const API_BASE_URL = "http://localhost:8000";
const GENERATE_DEFAULTS = {
  foregroundRatio: "0.85",
  mcResolution: "256",
  outputFormat: "glb",
};

const state = {
  selectedImageFile: null,
  backendHealthy: false,
  resultUrls: [],
  isGenerating: false,
};

document.addEventListener("DOMContentLoaded", () => {
  initFilePicker();
  initChatInput();
  checkBackendHealth();
  scrollToBottom();
  window.addEventListener("beforeunload", cleanupObjectUrls);
});

/* --- Image picker --- */
function initFilePicker() {
  const attachBtn = document.getElementById("attachBtn");
  const imageInput = document.getElementById("imageInput");
  if (!attachBtn || !imageInput) return;

  attachBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", (e) => handleImageSelected(e.target.files?.[0]));

  const removeBtn = document.getElementById("removeFileBtn");
  if (removeBtn) {
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearSelectedFile();
    });
  }
}

function handleImageSelected(file) {
  if (!file || !file.type.startsWith("image/")) {
    if (file) appendAIMessage("Please select a valid image file.");
    clearSelectedFile();
    return;
  }

  state.selectedImageFile = file;
  const nameEl = document.getElementById("fileChipName");
  const chip = document.getElementById("selectedFileChip");
  const attachBtn = document.getElementById("attachBtn");
  if (nameEl) nameEl.textContent = file.name;
  if (chip) chip.classList.add("chat-input__file-chip--visible");
  if (attachBtn) attachBtn.classList.add("chat-input__btn--active");
}

function clearSelectedFile() {
  state.selectedImageFile = null;
  const chip = document.getElementById("selectedFileChip");
  const attachBtn = document.getElementById("attachBtn");
  const imageInput = document.getElementById("imageInput");
  if (chip) chip.classList.remove("chat-input__file-chip--visible");
  if (attachBtn) attachBtn.classList.remove("chat-input__btn--active");
  if (imageInput) imageInput.value = "";
}

/* --- Chat Input: send on Enter / click --- */
function initChatInput() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  if (!input || !sendBtn) return;

  sendBtn.addEventListener("click", () => sendMessage(input));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  });
}

function isRemoveBgEnabled() {
  const toggle = document.getElementById("removeBgToggle");
  return toggle ? toggle.checked : false;
}

async function sendMessage(input) {
  if (state.isGenerating) return;

  const text = input.value.trim();
  if (!text) return;
  if (!state.selectedImageFile) {
    appendAIMessage("Please choose an image first (click the + button).");
    return;
  }

  const removeBg = isRemoveBgEnabled();
  const imagePreviewUrl = URL.createObjectURL(state.selectedImageFile);
  state.resultUrls.push(imagePreviewUrl);
  appendUserMessage(text, removeBg, imagePreviewUrl, state.selectedImageFile.name);
  input.value = "";
  clearSelectedFile();
  scrollToBottom();

  state.isGenerating = true;
  setSendDisabled(true);
  const loadingId = appendAILoadingMessage();
  scrollToBottom();

  try {
    const blob = await generateModel(state.selectedImageFile, removeBg);
    const resultUrl = URL.createObjectURL(blob);
    state.resultUrls.push(resultUrl);

    removeMessageById(loadingId);
    appendAIResultMessage(
      "Generation complete. You can preview the 3D model directly below.",
      resultUrl,
      GENERATE_DEFAULTS.outputFormat
    );
  } catch (error) {
    removeMessageById(loadingId);
    appendAIMessage(`Generate failed: ${error.message}`);
  } finally {
    state.isGenerating = false;
    setSendDisabled(false);
    scrollToBottom();
  }
}

async function generateModel(file, removeBg) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("remove_background_flag", String(removeBg));
  formData.append("foreground_ratio", GENERATE_DEFAULTS.foregroundRatio);
  formData.append("mc_resolution", GENERATE_DEFAULTS.mcResolution);
  formData.append("output_format", GENERATE_DEFAULTS.outputFormat);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/generate`, {
      method: "POST",
      body: formData,
    });
  } catch (networkError) {
    throw new Error(
      "Cannot reach backend. Check that FastAPI is running at " +
        API_BASE_URL +
        " and CORS is enabled for this origin."
    );
  }

  if (!response.ok) {
    let detail;
    try {
      detail = await response.text();
    } catch (_) {
      detail = "";
    }
    throw new Error(detail || `Server returned ${response.status}`);
  }

  return await response.blob();
}

function setSendDisabled(disabled) {
  const sendBtn = document.getElementById("sendBtn");
  if (!sendBtn) return;
  sendBtn.disabled = disabled;
  sendBtn.style.opacity = disabled ? "0.6" : "1";
}

/* --- Health check --- */
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    state.backendHealthy = response.ok;
  } catch (_error) {
    state.backendHealthy = false;
  }
}

async function ensureBackendHealthy() {
  if (state.backendHealthy) return true;
  await checkBackendHealth();
  return state.backendHealthy;
}

/* --- Append a user message bubble (with image preview) --- */
function appendUserMessage(text, removeBg, imageUrl, imageName) {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());
  const bgBadge = removeBg
    ? `<span class="msg__badge msg__badge--rm-bg">Remove BG: ON</span>`
    : "";
  const imageBlock = imageUrl
    ? `<div class="msg__image">
         <img src="${imageUrl}" alt="${escapeHtml(imageName || "Uploaded image")}" />
       </div>`
    : "";

  const html = `
    <div class="msg msg--user">
      <div class="msg__wrapper">
        <div class="msg__bubble msg__bubble--user" style="display:flex;flex-direction:column;gap:0.75rem">
          <p class="msg__text">${escapeHtml(text)}</p>
          ${imageBlock}
          ${bgBadge}
        </div>
        <div class="msg__timestamp">${time} &bull; User</div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

/* --- Append an AI response bubble --- */
function appendAIMessage(text) {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());

  const html = `
    <div class="msg msg--ai">
      <div class="msg__wrapper msg__wrapper--ai">
        <div class="msg__row">
          <div class="msg__avatar">RF</div>
          <div>
            <div class="msg__bubble msg__bubble--ai">
              <p class="msg__text">${escapeHtml(text)}</p>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

let _msgIdCounter = 0;

function appendAILoadingMessage() {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());
  const id = `loading-msg-${++_msgIdCounter}`;

  const html = `
    <div class="msg msg--ai" id="${id}">
      <div class="msg__wrapper msg__wrapper--ai">
        <div class="msg__row">
          <div class="msg__avatar">RF</div>
          <div>
            <div class="msg__bubble msg__bubble--ai msg__bubble--loading">
              <div class="msg__loading">
                <span class="msg__loading-dot"></span>
                <span class="msg__loading-dot"></span>
                <span class="msg__loading-dot"></span>
              </div>
              <p class="msg__text">Generating 3D model from your uploaded image&hellip;</p>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
  return id;
}

function removeMessageById(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendAIResultMessage(text, downloadUrl, ext) {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());
  const upperExt = ext.toUpperCase();
  const canPreview = ext.toLowerCase() === "glb";
  const previewBlock = canPreview
    ? `<model-viewer
          class="msg__model-viewer"
          src="${downloadUrl}"
          camera-controls
          touch-action="pan-y"
          auto-rotate
          auto-rotate-delay="500"
          rotation-per-second="30deg"
          camera-orbit="45deg 55deg auto"
          min-camera-orbit="auto auto auto"
          max-camera-orbit="auto auto auto"
          field-of-view="30deg"
          shadow-intensity="0.8"
          shadow-softness="0.6"
          exposure="1.1"
          interaction-prompt="auto"
          interaction-prompt-threshold="3000"
        ></model-viewer>`
    : "";

  const html = `
    <div class="msg msg--ai">
      <div class="msg__wrapper msg__wrapper--ai">
        <div class="msg__row">
          <div class="msg__avatar">RF</div>
          <div>
            <div class="msg__bubble msg__bubble--ai">
              <p class="msg__text">${escapeHtml(text)}</p>
              ${previewBlock}
              <a class="msg__download-link" href="${downloadUrl}" download="rapidforce_result.${ext}">
                <span class="material-symbols-outlined">download</span>
                Download ${upperExt}
              </a>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

/* --- Auto-scroll to bottom --- */
function scrollToBottom() {
  const container = document.getElementById("chatMessages");
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

/* --- XSS protection --- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function cleanupObjectUrls() {
  state.resultUrls.forEach((url) => URL.revokeObjectURL(url));
  state.resultUrls = [];
}
