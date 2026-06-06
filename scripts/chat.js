/* ===========================
   RapidForce — Chat Page Scripts
   Dual mode: Chat AI (Qwen3) + Render 3D (TripoSR)
   =========================== */

const API_3D = "http://localhost:8000";
const API_CHAT = "http://localhost:8001";
const API_AUTH = "http://localhost:8000";

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
  needsModelsRefresh: false,
  resultUrls: [],
  conversationHistory: [
    { role: "system", content: CHAT_DEFAULTS.systemPrompt },
  ],
};

const AUTH_STORAGE_KEY = "rapidforce_auth_logged_in";
const AUTH_USER_KEY = "rapidforce_auth_user";

/** Giới hạn model đã lưu / user (theo FRONTEND_API_USAGE.md). */
const SAVED_MODEL_LIMIT = 5;

function isAuthLoggedIn() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

let modelsLoginToastTimer = null;

function showModelsLoginToast() {
  const el = document.getElementById("modelsLoginToast");
  if (!el) return;
  el.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("chat-models-toast--visible"));
  });
  clearTimeout(modelsLoginToastTimer);
  modelsLoginToastTimer = setTimeout(() => hideModelsLoginToast(), 5200);
}

function hideModelsLoginToast() {
  const el = document.getElementById("modelsLoginToast");
  if (!el) return;
  clearTimeout(modelsLoginToastTimer);
  modelsLoginToastTimer = null;
  el.classList.remove("chat-models-toast--visible");
  setTimeout(() => {
    el.hidden = true;
  }, 320);
}

function initModelsLoginToast() {
  document.getElementById("modelsLoginToastClose")?.addEventListener("click", () => hideModelsLoginToast());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideModelsLoginToast();
  });
}

/** Đóng panel My Models khi đăng xuất; xóa hash nếu cần. */
function syncMyModelsSidebarVisibility() {
  const myModelsNavLink = document.getElementById("myModelsNavLink");
  const modelsPanel = document.getElementById("modelsPanel");
  const chatPanel = document.getElementById("chatPanel");
  const chatNavLink = document.getElementById("chatNavLink");
  if (!myModelsNavLink) return;

  const loggedIn = isAuthLoggedIn();

  if (!loggedIn && modelsPanel && chatPanel && !modelsPanel.hidden) {
    chatPanel.hidden = false;
    modelsPanel.hidden = true;
    chatNavLink?.classList.add("sidebar__link--active");
    myModelsNavLink.classList.remove("sidebar__link--active");
  }
  if (!loggedIn && window.location.hash === "#my-models") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initModelsLoginToast();
  initRightPanelNavigation();
  initUserMenu();
  initModeTabs();
  initFilePicker();
  initChatInput();
  initChatScrollOuterChrome();
  scrollToBottom();
  window.addEventListener("beforeunload", cleanupObjectUrls);
});

function initRightPanelNavigation() {
  const chatNavLink = document.getElementById("chatNavLink");
  const myModelsNavLink = document.getElementById("myModelsNavLink");
  const createNewBtn = document.getElementById("createNewBtn");
  const chatPanel = document.getElementById("chatPanel");
  const modelsPanel = document.getElementById("modelsPanel");
  const modelsFrame = document.getElementById("modelsFrame");
  if (!chatNavLink || !myModelsNavLink || !chatPanel || !modelsPanel || !modelsFrame) return;

  const setActiveNav = (isModels) => {
    chatNavLink.classList.toggle("sidebar__link--active", !isModels);
    myModelsNavLink.classList.toggle("sidebar__link--active", isModels);
  };

  const showChatPanel = () => {
    chatPanel.hidden = false;
    modelsPanel.hidden = true;
    setActiveNav(false);
    window.location.hash = "";
  };

  const showModelsPanel = () => {
    if (!isAuthLoggedIn()) return;
    chatPanel.hidden = true;
    modelsPanel.hidden = false;
    if (!modelsFrame.src) {
      modelsFrame.src = "./my-models.html?embed=1";
    } else if (state.needsModelsRefresh) {
      // Reload only the My Models panel after a successful save.
      modelsFrame.src = `./my-models.html?embed=1&refresh=${Date.now()}`;
      state.needsModelsRefresh = false;
    }
    setActiveNav(true);
    window.location.hash = "my-models";
  };

  chatNavLink.addEventListener("click", (event) => {
    event.preventDefault();
    showChatPanel();
  });

  myModelsNavLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (!isAuthLoggedIn()) {
      showModelsLoginToast();
      return;
    }
    showModelsPanel();
  });

  createNewBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    showChatPanel();
    document.getElementById("chatInput")?.focus();
  });

  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data || data.type !== "rapidforce:navigate") return;
    if (data.target === "chat") {
      showChatPanel();
      document.getElementById("chatInput")?.focus();
    } else if (data.target === "my-models") {
      if (isAuthLoggedIn()) showModelsPanel();
      else showModelsLoginToast();
    }
  });

  syncMyModelsSidebarVisibility();

  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === AUTH_STORAGE_KEY || event.key === AUTH_USER_KEY) {
      syncMyModelsSidebarVisibility();
      if (!isAuthLoggedIn()) {
        showChatPanel();
      }
    }
  });

  if (window.location.hash === "#my-models" && isAuthLoggedIn()) {
    showModelsPanel();
  } else {
    showChatPanel();
  }
}

/* ============================================================
   User Avatar Menu
   ============================================================ */
function initUserMenu() {
  const profileMenu = document.querySelector(".topnav__profile-menu");
  const menuToggleBtn = document.getElementById("userAvatarBtn");
  const menu = document.getElementById("userMenu");
  const usernameEl = document.getElementById("topnavUsername");
  const authActionBtn = document.getElementById("authActionBtn");
  if (!profileMenu || !menuToggleBtn || !menu || !authActionBtn || !usernameEl) return;

  const isLoggedIn = isAuthLoggedIn;
  const isMenuOpen = () => menu.classList.contains("active");
  const readStoredUser = () => {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  };
  const setUsername = (name) => {
    usernameEl.textContent = name && name.trim() ? name : "Khách";
  };
  const syncUsernameFromApi = async () => {
    if (!isLoggedIn()) {
      setUsername("Khách");
      return;
    }

    const storedUser = readStoredUser();
    const fallbackName =
      storedUser?.user_name ||
      [storedUser?.first_name, storedUser?.last_name].filter(Boolean).join(" ") ||
      storedUser?.email ||
      "Tài khoản";
    setUsername(fallbackName);

    if (!storedUser?.user_id) return;

    try {
      const response = await fetch(`${API_AUTH}/users/${storedUser.user_id}`);
      if (!response.ok) return;
      const user = await response.json();
      const liveName =
        user?.user_name ||
        [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
        user?.email ||
        fallbackName;
      setUsername(liveName);
      localStorage.setItem(
        AUTH_USER_KEY,
        JSON.stringify({
          ...storedUser,
          ...user,
        })
      );
    } catch (_) {
      // Keep fallback name when API is unavailable.
    }
  };
  const setLoggedIn = (value) => {
    localStorage.setItem(AUTH_STORAGE_KEY, String(value));
  };

  const applyMenuBaseStyles = () => {
    // Inline styles keep dropdown behavior stable even when cached CSS is stale.
    menu.style.position = "absolute";
    menu.style.top = "100%";
    menu.style.right = "0";
    menu.style.marginTop = "10px";
    menu.style.minWidth = "150px";
    menu.style.zIndex = "1000";
    menu.style.background = "rgba(255, 255, 255, 0.92)";
    menu.style.border = "1px solid rgba(172, 179, 183, 0.35)";
    menu.style.borderRadius = "10px";
    menu.style.boxShadow = "0 12px 24px rgba(0, 0, 0, 0.14)";
    menu.style.padding = "6px";
    menu.style.flexDirection = "column";

    authActionBtn.style.display = "block";
    authActionBtn.style.width = "100%";
    authActionBtn.style.textAlign = "left";
    authActionBtn.style.background = "none";
    authActionBtn.style.border = "none";
    authActionBtn.style.borderRadius = "8px";
    authActionBtn.style.padding = "10px 12px";
    authActionBtn.style.fontSize = "14px";
    authActionBtn.style.fontWeight = "700";
    authActionBtn.style.color = "#2d3337";
    authActionBtn.style.cursor = "pointer";
  };

  const closeMenu = () => {
    menu.classList.remove("active");
    menu.hidden = true;
    menu.style.display = "none";
    menuToggleBtn.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.hidden = false;
    menu.classList.add("active");
    menu.style.display = "flex";
    menuToggleBtn.setAttribute("aria-expanded", "true");
  };

  const renderAuthAction = () => {
    const loggedIn = isLoggedIn();
    authActionBtn.textContent = loggedIn ? "Đăng xuất" : "Đăng nhập";
  };

  const refreshAuthMenuState = () => {
    renderAuthAction();
    if (!isLoggedIn()) {
      // Keep UI consistent after logout across tabs/pages.
      setUsername("Khách");
    }
  };

  menuToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    refreshAuthMenuState();
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  authActionBtn.addEventListener("click", () => {
    if (isLoggedIn()) {
      setLoggedIn(false);
      localStorage.removeItem(AUTH_USER_KEY);
      setUsername("Khách");
      renderAuthAction();
      syncMyModelsSidebarVisibility();
      hideModelsLoginToast();
      closeMenu();
      return;
    }

    window.location.href = "./login_view.html";
  });

  authActionBtn.addEventListener("mouseenter", () => {
    authActionBtn.style.background = "rgba(89, 72, 211, 0.1)";
    authActionBtn.style.color = "#4d39c7";
  });
  authActionBtn.addEventListener("mouseleave", () => {
    authActionBtn.style.background = "none";
    authActionBtn.style.color = "#2d3337";
  });

  document.addEventListener("click", (event) => {
    if (isMenuOpen() && !profileMenu.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  // Sync menu text when auth state changes outside this page.
  window.addEventListener("focus", () => {
    refreshAuthMenuState();
    syncMyModelsSidebarVisibility();
  });
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === AUTH_STORAGE_KEY || event.key === AUTH_USER_KEY) {
      refreshAuthMenuState();
    }
  });

  applyMenuBaseStyles();
  refreshAuthMenuState();
  closeMenu();
  syncUsernameFromApi();
}

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
      GENERATE_DEFAULTS.outputFormat,
      {
        sourceImageFile: imageFile,
        removeBg: removeBg,
      }
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
function appendAIResultMessage(text, downloadUrl, ext, storePayload = null) {
  const container = document.getElementById("chatMessages");
  const time = formatTime(new Date());
  const upperExt = ext.toUpperCase();
  const loggedIn = localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  const canPreview = ext.toLowerCase() === "glb";
  const canStore = loggedIn && !!storePayload?.sourceImageFile;
  const storeButton = canStore
    ? `<button
           class="msg__icon-action"
           type="button"
           title="Lưu trữ mô hình"
           aria-label="Lưu trữ mô hình"
         >
           <span class="material-symbols-outlined">inventory_2</span>
         </button>`
    : "";
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
              <div class="msg__result-actions">
                <a class="msg__download-link" href="${downloadUrl}" download="rapidforce_result.${ext}">
                  <span class="material-symbols-outlined">download</span>
                  Download ${upperExt}
                </a>
                ${storeButton}
              </div>
            </div>
            <div class="msg__timestamp" style="margin-top:0.5rem">${time} &bull; RapidForce AI</div>
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML("beforeend", html);
  const messageEl = container.lastElementChild;
  const storeBtn = messageEl?.querySelector(".msg__icon-action");
  if (storeBtn) {
    storeBtn.addEventListener("click", async () => {
      if (storeBtn.classList.contains("msg__icon-action--saved")) return;

      storeBtn.disabled = true;
      storeBtn.classList.add("msg__icon-action--saving");
      storeBtn.title = "Đang kiểm tra giới hạn...";

      try {
        const savedCount = await fetchUserSavedModelCountOrThrow();
        if (savedCount >= SAVED_MODEL_LIMIT) {
          storeBtn.classList.remove("msg__icon-action--saving");
          storeBtn.disabled = false;
          storeBtn.title = "Lưu trữ mô hình";
          appendAIMessage(
            `Bạn đã lưu đủ ${SAVED_MODEL_LIMIT} model (giới hạn tài khoản). Hãy xóa bớt model trong My Models rồi thử lưu lại.`
          );
          scrollToBottom();
          return;
        }

        storeBtn.title = "Đang lưu trữ...";
        await storeGeneratedModelToBackend(storePayload, ext);
        storeBtn.classList.remove("msg__icon-action--saving");
        storeBtn.classList.add("msg__icon-action--saved");
        storeBtn.title = "Đã lưu trữ";
        state.needsModelsRefresh = true;
      } catch (error) {
        storeBtn.classList.remove("msg__icon-action--saving");
        storeBtn.disabled = false;
        storeBtn.title = "Lưu trữ mô hình";
        appendAIMessage(`Lưu trữ thất bại: ${error.message}`);
      }
      scrollToBottom();
    });
  }
}

function getCurrentAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Số model đã lưu của user hiện tại (trước khi gọi generate/store).
 * Ưu tiên GET /users/{id} (model_count), fallback GET /users/{id}/models (đếm phần tử).
 * Nếu không có user_id: GET /models và lọc theo user_name/email.
 */
async function fetchUserSavedModelCountOrThrow() {
  const user = getCurrentAuthUser();
  if (!user) {
    throw new Error("Bạn cần đăng nhập để lưu trữ.");
  }

  const uid = user.user_id != null && String(user.user_id).trim() !== "" ? String(user.user_id) : "";

  if (uid) {
    try {
      const detailRes = await fetch(`${API_3D}/users/${encodeURIComponent(uid)}`);
      if (detailRes.ok) {
        const data = await detailRes.json();
        const n = Number(data?.model_count);
        if (Number.isFinite(n) && n >= 0) {
          return n;
        }
      }
    } catch (_) {
      /* fallback list */
    }

    const listRes = await fetch(`${API_3D}/users/${encodeURIComponent(uid)}/models`);
    if (!listRes.ok) {
      throw new Error(`Không kiểm tra được số model đang có (${listRes.status}).`);
    }
    const payload = await listRes.json();
    const rawItems = Array.isArray(payload)
      ? payload
      : payload?.models || payload?.items || payload?.data || [];
    return Array.isArray(rawItems) ? rawItems.length : 0;
  }

  const filterName = user.user_name || user.email;
  if (!filterName) {
    throw new Error("Thiếu user_id — không thể kiểm tra giới hạn model. Vui lòng đăng nhập lại.");
  }

  const listRes = await fetch(`${API_3D}/models?limit=200&offset=0`);
  if (!listRes.ok) {
    throw new Error(`Không kiểm tra được số model đang có (${listRes.status}).`);
  }
  const payload = await listRes.json();
  const rawItems = Array.isArray(payload)
    ? payload
    : payload?.models || payload?.items || payload?.data || [];
  if (!Array.isArray(rawItems)) return 0;
  return rawItems.filter((item) => {
    if (item?.user_name) return String(item.user_name) === String(filterName);
    return false;
  }).length;
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh đầu vào."));
    reader.readAsDataURL(file);
  });
}

async function storeGeneratedModelToBackend(storePayload, ext) {
  if (!storePayload?.sourceImageFile) {
    throw new Error("Không còn dữ liệu ảnh để lưu.");
  }

  const user = getCurrentAuthUser();
  if (!user) {
    throw new Error("Bạn cần đăng nhập để lưu trữ.");
  }

  const formData = new FormData();
  formData.append("image", storePayload.sourceImageFile);
  formData.append("remove_background_flag", String(!!storePayload.removeBg));
  formData.append("foreground_ratio", GENERATE_DEFAULTS.foregroundRatio);
  formData.append("mc_resolution", GENERATE_DEFAULTS.mcResolution);
  formData.append("output_format", ext);
  formData.append("compress_draco", "true");

  // Keep input image reference so My Models can show lightweight thumbnails.
  try {
    const imageDataUrl = await fileToDataUrl(storePayload.sourceImageFile);
    if (imageDataUrl) {
      formData.append("image_url", imageDataUrl);
    }
  } catch (_) {
    // image_url is optional, continue storing model without it.
  }

  if (user.user_id) {
    formData.append("user_id", String(user.user_id));
  } else if (user.user_name) {
    formData.append("user_name", user.user_name);
  } else if (user.email) {
    formData.append("user_name", user.email);
  }

  let response;
  try {
    response = await fetch(`${API_3D}/generate/store`, {
      method: "POST",
      body: formData,
    });
  } catch (_) {
    throw new Error("Không kết nối được backend lưu trữ.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (_) {
      detail = "";
    }
    throw new Error(detail || `Backend trả lỗi ${response.status}`);
  }

  return await response.json();
}

/* ============================================================
   Utilities
   ============================================================ */
function getChatScrollOuter() {
  return document.querySelector(".chat-scroll-outer");
}

function initChatScrollOuterChrome() {
  const outer = getChatScrollOuter();
  if (!outer) return;
  let idleTimer;
  outer.addEventListener(
    "scroll",
    () => {
      outer.classList.add("chat-scroll-outer--scrolling");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        outer.classList.remove("chat-scroll-outer--scrolling");
      }, 900);
    },
    { passive: true }
  );
}

function scrollToBottom() {
  const outer = getChatScrollOuter();
  const inner = document.getElementById("chatMessages");
  const scrollEl = outer || inner;
  if (scrollEl) {
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
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
