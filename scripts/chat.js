/* ===========================
   RapidForce — Chat Page Scripts
   Dual mode: Chat AI (Qwen3) + Render 3D (TripoSR)
   =========================== */

const API_3D = "http://localhost:8000";
const API_CHAT = "http://localhost:8001";

const GENERATE_DEFAULTS = {
  foregroundRatio: "0.85",
  mcResolution: "256",
  outputFormat: "glb",
};

const CHAT_DEFAULTS = {
  maxNewTokens: 512,
  temperature: 0.7,
  systemPrompt:
    "You are RapidForce AI, a helpful assistant specialized in 3D modeling, game development, and creative workflows. Answer concisely and helpfully.",
};

const state = {
  mode: "chat",
  selectedImageFile: null,
  isProcessing: false,
  resultUrls: [],
  conversationHistory: [
    { role: "system", content: CHAT_DEFAULTS.systemPrompt },
  ],
};

document.addEventListener("DOMContentLoaded", () => {
  initModeTabs();
  initFilePicker();
  initChatInput();
  scrollToBottom();
  window.addEventListener("beforeunload", cleanupObjectUrls);
});

/* ============================================================
   Mode Tabs
   ============================================================ */
function initModeTabs() {
  const tabs = document.querySelectorAll(".chat-mode-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (state.isProcessing) return;
      const mode = tab.dataset.mode;
      if (mode === state.mode) return;
      state.mode = mode;
      tabs.forEach((t) => t.classList.remove("chat-mode-tab--active"));
      tab.classList.add("chat-mode-tab--active");
      applyModeUI();
    });
  });
}

function applyModeUI() {
  const wrap = document.querySelector(".chat-input-wrap");
  const input = document.getElementById("chatInput");

  if (state.mode === "render") {
    wrap.classList.add("chat-input-wrap--render");
    input.placeholder = "Describe your 3D vision...";
  } else {
    wrap.classList.remove("chat-input-wrap--render");
    input.placeholder = "Ask anything...";
    clearSelectedFile();
  }
}

/* ============================================================
   File Picker (Render 3D only)
   ============================================================ */
function initFilePicker() {
  const attachBtn = document.getElementById("attachBtn");
  const imageInput = document.getElementById("imageInput");
  if (!attachBtn || !imageInput) return;

  attachBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", (e) =>
    handleImageSelected(e.target.files?.[0])
  );

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

/* ============================================================
   Chat Input
   ============================================================ */
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
  if (state.isProcessing) return;
  const text = input.value.trim();
  if (!text) return;

  if (state.mode === "render") {
    await sendRender3D(input, text);
  } else {
    await sendChat(input, text);
  }
}

/* ============================================================
   MODE 1: Chat AI (Qwen3)
   ============================================================ */
async function sendChat(input, text) {
  appendUserMessage(text);
  input.value = "";
  scrollToBottom();

  state.conversationHistory.push({ role: "user", content: text });

  state.isProcessing = true;
  setSendDisabled(true);
  const loadingId = appendAIChatLoadingMessage();
  scrollToBottom();

  try {
    const answer = await callQwenChat(state.conversationHistory);
    state.conversationHistory.push({ role: "assistant", content: answer });

    removeMessageById(loadingId);
    appendAIMessage(answer);
  } catch (error) {
    removeMessageById(loadingId);
    appendAIMessage(`Chat error: ${error.message}`);
  } finally {
    state.isProcessing = false;
    setSendDisabled(false);
    scrollToBottom();
  }
}

async function callQwenChat(messages) {
  let response;
  try {
    response = await fetch(`${API_CHAT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        max_new_tokens: CHAT_DEFAULTS.maxNewTokens,
        temperature: CHAT_DEFAULTS.temperature,
      }),
    });
  } catch (_networkErr) {
    throw new Error(
      `Cannot reach Qwen backend at ${API_CHAT}. Make sure qwen_api.py is running and CORS is enabled.`
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

  const data = await response.json();
  return data.answer;
}

/* ============================================================
   MODE 1b: Chat AI — Streaming variant (unused by default, available)
   ============================================================ */
async function callQwenChatStream(messages, onToken) {
  const response = await fetch(`${API_CHAT}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages,
      max_new_tokens: CHAT_DEFAULTS.maxNewTokens,
      temperature: CHAT_DEFAULTS.temperature,
      stream: true,
    }),
  });

  if (!response.ok) throw new Error("Chat stream failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onToken(chunk, fullText);
  }

  return fullText;
}

/* ============================================================
   MODE 2: Render 3D (TripoSR)
   ============================================================ */
async function sendRender3D(input, text) {
  if (!state.selectedImageFile) {
    appendAIMessage("Please choose an image first (click the + button).");
    return;
  }

  const removeBg = isRemoveBgEnabled();
  const imagePreviewUrl = URL.createObjectURL(state.selectedImageFile);
  state.resultUrls.push(imagePreviewUrl);

  appendUserRenderMessage(text, removeBg, imagePreviewUrl, state.selectedImageFile.name);
  const imageFile = state.selectedImageFile;
  input.value = "";
  clearSelectedFile();
  scrollToBottom();

  state.isProcessing = true;
  setSendDisabled(true);
  const loadingId = appendAI3DLoadingMessage();
  scrollToBottom();

  try {
    const blob = await generateModel(imageFile, removeBg);
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
    state.isProcessing = false;
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
    response = await fetch(`${API_3D}/generate`, {
      method: "POST",
      body: formData,
    });
  } catch (_networkError) {
    throw new Error(
      `Cannot reach 3D backend at ${API_3D}. Check that FastAPI is running and CORS is enabled.`
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

/* ============================================================
   UI Helpers
   ============================================================ */
function setSendDisabled(disabled) {
  const sendBtn = document.getElementById("sendBtn");
  if (!sendBtn) return;
  sendBtn.disabled = disabled;
  sendBtn.style.opacity = disabled ? "0.6" : "1";
}

/* --- User message (chat mode, text only) --- */
function appendUserMessage(text) {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());

  const html = `
    <div class="msg msg--user">
      <div class="msg__wrapper">
        <div class="msg__bubble msg__bubble--user">
          <p class="msg__text">${escapeHtml(text)}</p>
        </div>
        <div class="msg__timestamp">${time} &bull; User</div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

/* --- User message (render mode, with image) --- */
function appendUserRenderMessage(text, removeBg, imageUrl, imageName) {
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
          <span class="msg__badge msg__badge--render">Render 3D</span>
          <p class="msg__text">${escapeHtml(text)}</p>
          ${imageBlock}
          ${bgBadge}
        </div>
        <div class="msg__timestamp">${time} &bull; User</div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

/* --- AI text message --- */
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
              <div class="msg__text-content">${formatMarkdown(text)}</div>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
}

/* --- Loading: Chat --- */
let _msgIdCounter = 0;

function appendAIChatLoadingMessage() {
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
              <p class="msg__text">Thinking&hellip;</p>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
  return id;
}

/* --- Loading: 3D Generation --- */
function appendAI3DLoadingMessage() {
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

/* --- AI result with 3D viewer --- */
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
          camera-orbit="0deg 75deg 105%"
          min-camera-orbit="auto auto auto"
          max-camera-orbit="auto auto auto"
          field-of-view="30deg"
          orientation="0deg -90deg 0deg"
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

/* ============================================================
   Utilities
   ============================================================ */
function scrollToBottom() {
  const container = document.getElementById("chatMessages");
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function cleanupObjectUrls() {
  state.resultUrls.forEach((url) => URL.revokeObjectURL(url));
  state.resultUrls = [];
}
