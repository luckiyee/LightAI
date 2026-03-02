import { api, streamChat } from "./api.js";
import { storage } from "./storage.js";

const ADMIN_PASSWORD = "Kli-T10-Pmo";
const GUEST_MAX_MESSAGES = 5;

const EDITIONS = {
  flash: {
    id: "flash",
    label: "Flash",
    model: "qwen2.5:3b",
    temperature: 0.5,
    maxTokens: 512,
    hint: "Fast mode"
  },
  light: {
    id: "light",
    label: "Light",
    model: "llama3.1:8b",
    temperature: 0.7,
    maxTokens: 1024,
    hint: "Deep mode"
  }
};

const dom = {
  toastRoot: document.getElementById("toastRoot"),
  chatTitle: document.getElementById("chatTitle"),
  statusPill: document.getElementById("statusPill"),
  conversationList: document.getElementById("conversationList"),
  authLoggedOut: document.getElementById("authLoggedOut"),
  authLoggedIn: document.getElementById("authLoggedIn"),
  authUsername: document.getElementById("authUsername"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  modelBadge: document.getElementById("modelBadge"),
  editionSelect: document.getElementById("editionSelect"),
  runtimeHint: document.getElementById("runtimeHint"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  promptInput: document.getElementById("promptInput"),
  charCount: document.getElementById("charCount"),
  quickActionsBtn: document.getElementById("quickActionsBtn"),
  quickActionsMenu: document.getElementById("quickActionsMenu"),
  uploadFileBtn: document.getElementById("uploadFileBtn"),
  uploadImageBtn: document.getElementById("uploadImageBtn"),
  toggleWebSearchBtn: document.getElementById("toggleWebSearchBtn"),
  attachmentList: document.getElementById("attachmentList"),
  fileInput: document.getElementById("fileInput"),
  imageInput: document.getElementById("imageInput"),
  sendBtn: document.getElementById("sendBtn"),
  sendBtnLabel: document.getElementById("sendBtnLabel"),
  cancelBtn: document.getElementById("cancelBtn"),
  messageTemplate: document.getElementById("messageTemplate")
};

const state = {
  user: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  models: [],
  settings: storage.getAllPreferences(),
  lastUserMessage: "",
  streaming: false,
  awaitingPromptOverride: false,
  abortController: null,
  stickToBottom: true,
  enableWebSearch: false,
  pendingAttachments: []
};

function showToast(message, kind = "success", timeoutMs = 2600) {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  dom.toastRoot.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}

function setStatus(text, kind = "neutral") {
  dom.statusPill.textContent = text;
  dom.statusPill.style.color = kind === "error" ? "#b91c1c" : kind === "ok" ? "#166534" : "";
}

function updateComposerState() {
  const hasModel = Boolean(state.settings.selectedModel);
  dom.promptInput.disabled = !hasModel || state.streaming;
  dom.sendBtn.hidden = state.streaming;
  dom.cancelBtn.hidden = !state.streaming;
  dom.sendBtn.disabled = !hasModel || state.streaming;
  dom.newChatBtn.disabled = state.streaming;
  if (dom.editionSelect) dom.editionSelect.disabled = state.streaming;
  if (dom.quickActionsBtn) dom.quickActionsBtn.disabled = state.streaming;
  if (state.streaming && dom.quickActionsMenu) dom.quickActionsMenu.hidden = true;
}

function updateAuthState() {
  const loggedIn = Boolean(state.user);
  dom.authLoggedOut.hidden = loggedIn;
  dom.authLoggedOut.style.display = loggedIn ? "none" : "";
  dom.authLoggedIn.hidden = !loggedIn;
  dom.authLoggedIn.style.display = loggedIn ? "" : "none";
  dom.authUsername.textContent = loggedIn ? state.user.username : "";
  updateComposerState();
}

function updateCharCount() {
  const count = dom.promptInput.value.length;
  dom.charCount.textContent = `${count} / 4000`;
  dom.charCount.hidden = count <= 3500;
}

function autosizePrompt() {
  dom.promptInput.style.height = "auto";
  dom.promptInput.style.height = `${Math.min(dom.promptInput.scrollHeight, 180)}px`;
}

function maybeScrollToBottom(force = false) {
  if (force || state.stickToBottom) {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }
}

function onFeedScroll() {
  const threshold = 36;
  const bottomGap =
    dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop - dom.chatMessages.clientHeight;
  state.stickToBottom = bottomGap < threshold;
}

function makeMessageNode(role, content, options = {}) {
  const fragment = dom.messageTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".msg");
  const avatar = fragment.querySelector(".msg-avatar");
  const body = fragment.querySelector(".msg-body");
  const contentEl = fragment.querySelector(".msg-content");
  const sourceBtn = fragment.querySelector(".source-btn");
  const copyBtn = fragment.querySelector(".copy-btn");
  const retryBtn = fragment.querySelector(".retry-btn");

  article.classList.add(role);
  if (options.typing) contentEl.classList.add("typing-cursor");

  if (role === "system") {
    avatar.remove();
    body.style.maxWidth = "100%";
    sourceBtn.remove();
    copyBtn.remove();
    retryBtn.remove();
  }

  if (role === "user") {
    sourceBtn.remove();
    copyBtn.remove();
    retryBtn.remove();
  }

  if (role === "ai") {
    const sources = Array.isArray(options.sources) ? options.sources : [];
    if (sources.length > 0) {
      article.classList.add("has-sources");
      sourceBtn.hidden = false;
      sourceBtn.textContent = `🌐 ${sources.length}`;
      sourceBtn.title = "Show web sources";
      sourceBtn.addEventListener("click", () => {
        const formatted = sources
          .map((source, index) => `${index + 1}. ${source.title}\n${source.url || ""}`.trim())
          .join("\n\n");
        showToast(`Sources available:\n${formatted}`, "success", 5200);
      });
    } else {
      sourceBtn.remove();
    }
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(contentEl.textContent || "");
      showToast("Copied to clipboard.");
    });
    retryBtn.addEventListener("click", () => {
      if (!state.lastUserMessage) return;
      dom.promptInput.value = state.lastUserMessage;
      updateCharCount();
      autosizePrompt();
      dom.promptInput.focus();
    });
  }

  contentEl.textContent = content;
  return { article, contentEl };
}

function renderMessages() {
  dom.chatMessages.innerHTML = "";
  if (state.messages.length === 0) {
    const { article } = makeMessageNode(
      "system",
      state.user
        ? "Start a new conversation with Light. Use + to upload files/images or enable web search."
        : `Guest mode enabled. You can send up to ${GUEST_MAX_MESSAGES} messages before login.`
    );
    dom.chatMessages.appendChild(article);
    maybeScrollToBottom(true);
    return;
  }

  for (const message of state.messages) {
    const role = message.role === "assistant" ? "ai" : message.role;
    const { article } = makeMessageNode(role, message.content, { sources: message.sources || [] });
    dom.chatMessages.appendChild(article);
  }
  maybeScrollToBottom(true);
}

function renderConversations() {
  dom.conversationList.innerHTML = "";
  if (!state.user) return;
  if (state.conversations.length === 0) {
    const item = document.createElement("li");
    item.className = "convo-item";
    item.textContent = "No conversations yet.";
    dom.conversationList.appendChild(item);
    return;
  }

  for (const convo of state.conversations) {
    const item = document.createElement("li");
    item.className = "convo-item";
    if (convo.id === state.activeConversationId) item.classList.add("active");

    const open = document.createElement("div");
    open.className = "convo-open";
    open.textContent = convo.title || "Untitled";
    open.title = convo.title || "Untitled";
    open.addEventListener("click", () => void loadConversation(convo.id));

    const actions = document.createElement("div");
    actions.className = "convo-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "↗";
    loadBtn.title = "Load";
    loadBtn.addEventListener("click", () => void loadConversation(convo.id));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "🗑";
    delBtn.title = "Delete";
    delBtn.addEventListener("click", () => void removeConversation(convo.id));

    actions.append(loadBtn, delBtn);
    item.append(open, actions);
    dom.conversationList.appendChild(item);
  }
}

function applyLockedRuntimeSettings() {
  const edition = state.settings.selectedEdition === "light" ? "light" : "flash";
  const config = EDITIONS[edition];
  state.settings.selectedEdition = config.id;
  state.settings.selectedModel = config.model;
  state.settings.temperature = config.temperature;
  state.settings.maxTokens = config.maxTokens;
  storage.setSelectedEdition(config.id);
  storage.setSelectedModel(config.model);
  storage.setTemperature(config.temperature);
  storage.setMaxTokens(config.maxTokens);
}

function applyEditionUi() {
  const edition = state.settings.selectedEdition === "light" ? "light" : "flash";
  if (dom.editionSelect) dom.editionSelect.value = edition;
  if (dom.modelBadge) dom.modelBadge.textContent = "Light";
  if (dom.runtimeHint) dom.runtimeHint.textContent = EDITIONS[edition].hint;
}

function setEdition(editionId) {
  if (state.streaming) return;
  const safe = editionId === "light" ? "light" : "flash";
  if (state.settings.selectedEdition === safe) return;
  state.settings.selectedEdition = safe;
  applyLockedRuntimeSettings();
  applyEditionUi();
  showToast(`Edition switched to ${EDITIONS[safe].label}.`);
}

function updateWebSearchUi() {
  if (!dom.toggleWebSearchBtn) return;
  dom.toggleWebSearchBtn.textContent = `Web search: ${state.enableWebSearch ? "On" : "Off"}`;
}

function renderPendingAttachments() {
  if (!dom.attachmentList) return;
  dom.attachmentList.innerHTML = "";
  for (const item of state.pendingAttachments) {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";

    const label = document.createElement("span");
    label.textContent = item.kind === "image" ? `🖼 ${item.name}` : `📎 ${item.name}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${item.name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      state.pendingAttachments = state.pendingAttachments.filter((entry) => entry.id !== item.id);
      renderPendingAttachments();
    });

    chip.append(label, removeBtn);
    dom.attachmentList.appendChild(chip);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsText(file);
  });
}

async function fileToAttachment(file, kind) {
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const MAX_TEXT_BYTES = 300 * 1024;
  if (kind === "image") {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name} is too large. Max image size is 2MB.`);
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id: crypto.randomUUID(),
      kind: "image",
      name: file.name,
      mimeType: file.type || "image/*",
      content: dataUrl
    };
  }

  if (file.size > MAX_TEXT_BYTES) {
    throw new Error(`${file.name} is too large. Max file size is 300KB.`);
  }
  const text = await readFileAsText(file);
  return {
    id: crypto.randomUUID(),
    kind: "file",
    name: file.name,
    mimeType: file.type || "text/plain",
    content: text.slice(0, 5000)
  };
}

async function handlePickedFiles(fileList, kind) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  for (const file of files.slice(0, 8)) {
    try {
      const attachment = await fileToAttachment(file, kind);
      state.pendingAttachments.push(attachment);
    } catch (error) {
      showToast(error.message, "error", 3800);
    }
  }
  if (state.pendingAttachments.length > 8) {
    state.pendingAttachments = state.pendingAttachments.slice(-8);
  }
  renderPendingAttachments();
}

async function loadModels() {
  try {
    const result = await api.getModels();
    const models = Array.isArray(result.models) ? result.models : [];
    state.models = models;

    if (!models.length) {
      if (dom.modelBadge) dom.modelBadge.textContent = "Unavailable";
      return;
    }

    const hasLight = models.includes(EDITIONS.light.model);
    const hasFlash = models.includes(EDITIONS.flash.model);
    if (!hasLight || !hasFlash) {
      showToast(
        "Some editions are unavailable. Embedded fallback remains active.",
        "error",
        5000
      );
    }

    const desiredEdition = state.settings.selectedEdition === "light" ? "light" : "flash";
    const desiredModel = EDITIONS[desiredEdition].model;
    if (!models.includes(desiredModel)) {
      const fallbackEdition = models.includes(EDITIONS.flash.model) ? "flash" : "light";
      state.settings.selectedEdition = fallbackEdition;
      showToast(`Switched to available edition: ${EDITIONS[fallbackEdition].label}.`, "error");
    }
    applyLockedRuntimeSettings();
    applyEditionUi();
  } catch (error) {
    showToast(`Model load failed: ${error.message}`, "error");
  }
}

async function checkHealth() {
  try {
    const health = await api.getHealth();
    if (health.runtimeReachable) {
      const label = health.runtimeProvider === "ollama" ? "Online (Ollama)" : "Online (Embedded)";
      setStatus(label, "ok");
    } else {
      setStatus("Runtime unreachable", "error");
    }
  } catch (error) {
    setStatus(`Offline: ${error.message}`, "error");
  }
}

async function refreshConversations() {
  if (!state.user) {
    state.conversations = [];
    renderConversations();
    return;
  }
  try {
    const payload = await api.listConversations();
    state.conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
    renderConversations();
  } catch (error) {
    showToast(`Conversation list failed: ${error.message}`, "error");
  }
}

async function loadConversation(id) {
  try {
    const payload = await api.getConversation(id);
    const convo = payload.conversation || payload;
    state.activeConversationId = convo.id;
    state.messages = Array.isArray(convo.messages) ? convo.messages : [];
    dom.chatTitle.textContent = convo.title || "Light Chat";
    state.lastUserMessage = [...state.messages].reverse().find((m) => m.role === "user")?.content || "";
    renderMessages();
    renderConversations();
  } catch (error) {
    showToast(`Load failed: ${error.message}`, "error");
  }
}

async function removeConversation(id) {
  try {
    await api.deleteConversation(id);
    if (state.activeConversationId === id) {
      state.activeConversationId = null;
      state.messages = [];
      dom.chatTitle.textContent = "Light Chat";
      renderMessages();
    }
    await refreshConversations();
  } catch (error) {
    showToast(`Delete failed: ${error.message}`, "error");
  }
}

async function persistConversation() {
  if (!state.user) return;
  const messages = state.messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (!messages.length) return;

  const title = messages.find((m) => m.role === "user")?.content?.slice(0, 60) || "New conversation";
  const payload = await api.saveConversation({
    id: state.activeConversationId,
    title,
    messages
  });
  const saved = payload.conversation || payload;
  state.activeConversationId = saved.id;
  dom.chatTitle.textContent = saved.title || "Light Chat";
  await refreshConversations();
}

function clearAuthInputs() {
  dom.usernameInput.value = "";
  dom.passwordInput.value = "";
}

async function handleRegister() {
  if (state.streaming) return;
  try {
    const res = await api.register(dom.usernameInput.value.trim(), dom.passwordInput.value);
    state.user = res.user || res;
    dom.chatTitle.textContent = "Light Chat";
    clearAuthInputs();
    updateAuthState();
    await refreshConversations();
    renderMessages();
    showToast("Account created.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleLogin() {
  if (state.streaming) return;
  try {
    const res = await api.login(dom.usernameInput.value.trim(), dom.passwordInput.value);
    state.user = res.user || res;
    dom.chatTitle.textContent = "Light Chat";
    clearAuthInputs();
    updateAuthState();
    await refreshConversations();
    renderMessages();
    showToast("Logged in.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleLogout() {
  if (state.streaming) return;
  try {
    await api.logout();
    state.user = null;
    state.activeConversationId = null;
    state.messages = [];
    dom.chatTitle.textContent = "Light Chat (Guest)";
    updateAuthState();
    renderMessages();
    renderConversations();
    showToast("Logged out.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function appendMessageToState(role, content, extras = {}) {
  state.messages.push({ role, content, ...extras });
  renderMessages();
}

function appendSystemMessage(content) {
  appendMessageToState("system", content);
}

function getGuestMessageCount() {
  return state.messages.filter((m) => m.role === "user").length;
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.streaming) return;

  let content = dom.promptInput.value.trim();
  if (!content && state.pendingAttachments.length === 0) return;
  if (!content && state.pendingAttachments.length > 0) {
    content = "Please use the attached files/images to help answer.";
  }

  if (!state.user && getGuestMessageCount() >= GUEST_MAX_MESSAGES) {
    showToast(`Guest limit reached (${GUEST_MAX_MESSAGES}). Login to continue.`, "error", 4200);
    appendSystemMessage(
      `You reached the guest limit (${GUEST_MAX_MESSAGES} messages). Login or register to keep chatting and save conversations.`
    );
    return;
  }

  if (content === ADMIN_PASSWORD && state.pendingAttachments.length === 0) {
    state.awaitingPromptOverride = true;
    dom.promptInput.value = "";
    updateCharCount();
    autosizePrompt();
    showToast("Prompt override unlocked.");
    return;
  }

  if (state.awaitingPromptOverride) {
    storage.setBasePrompt(content);
    state.settings.basePrompt = content;
    state.awaitingPromptOverride = false;
    dom.promptInput.value = "";
    updateCharCount();
    autosizePrompt();
    showToast("Base prompt updated.");
    return;
  }

  const outboundAttachments = state.pendingAttachments.map((entry) => ({
    kind: entry.kind,
    name: entry.name,
    mimeType: entry.mimeType,
    content: entry.content
  }));
  const attachmentNames = outboundAttachments.map((entry) => entry.name);
  const userMessageForUi = attachmentNames.length
    ? `${content}\n\n[Attachments: ${attachmentNames.join(", ")}]`
    : content;

  state.lastUserMessage = content;
  appendMessageToState("user", userMessageForUi);

  dom.promptInput.value = "";
  state.pendingAttachments = [];
  renderPendingAttachments();
  updateCharCount();
  autosizePrompt();

  const { article, contentEl } = makeMessageNode("ai", "", { typing: true });
  dom.chatMessages.appendChild(article);
  maybeScrollToBottom();

  state.abortController = new AbortController();
  state.streaming = true;
  updateComposerState();

  let assistantText = "";
  let assistantSources = [];
  let activeModel = state.settings.selectedModel;
  try {
    const payloadMessages = [
      { role: "system", content: state.settings.basePrompt || storage.getBasePrompt() },
      ...state.messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => ({ role: msg.role, content: msg.content }))
    ];

    const runStream = async (model, tokenLimit) => {
      for await (const chunk of streamChat({
        model,
        messages: payloadMessages,
        temperature: Number(state.settings.temperature),
        maxTokens: tokenLimit,
        enableWebSearch: state.enableWebSearch,
        attachments: outboundAttachments,
        signal: state.abortController.signal
      })) {
        if (chunk.type === "sources") {
          assistantSources = Array.isArray(chunk.sources) ? chunk.sources : [];
        }
        if (chunk.type === "token") {
          assistantText += chunk.content;
          contentEl.textContent = assistantText;
          maybeScrollToBottom();
        }
      }
    };

    try {
      await runStream(activeModel, Number(state.settings.maxTokens));
    } catch (primaryError) {
      const message = String(primaryError?.message || "");
      const looksLikeRuntimeCrash = /exit status 2|runner process|signal|out of memory/i.test(message);
      const oppositeEdition = state.settings.selectedEdition === "light" ? "flash" : "light";
      const fallbackModel = EDITIONS[oppositeEdition].model;

      if (!looksLikeRuntimeCrash || !state.models.includes(fallbackModel) || fallbackModel === activeModel) {
        throw primaryError;
      }

      showToast(`Model failed (${activeModel}). Retrying with ${fallbackModel}...`, "error", 4000);
      assistantText = "";
      contentEl.textContent = "";
      activeModel = fallbackModel;
      await runStream(fallbackModel, EDITIONS[oppositeEdition].maxTokens);
      state.settings.selectedEdition = oppositeEdition;
      applyLockedRuntimeSettings();
      applyEditionUi();
      appendSystemMessage(`Switched edition to ${EDITIONS[oppositeEdition].label} after runtime failure.`);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      showToast("Generation cancelled.");
    } else {
      showToast(error.message, "error");
      appendSystemMessage(`AI error: ${error.message}`);
    }
  } finally {
    contentEl.classList.remove("typing-cursor");
    state.streaming = false;
    state.abortController = null;
    updateComposerState();
  }

  article.remove();
  if (assistantText) {
    appendMessageToState("assistant", assistantText, { sources: assistantSources });
    await persistConversation();
  }
}

function cancelStreaming() {
  if (state.abortController) state.abortController.abort();
}

function bindEvents() {
  dom.chatMessages.addEventListener("scroll", onFeedScroll);
  dom.promptInput.addEventListener("input", () => {
    updateCharCount();
    autosizePrompt();
  });
  dom.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      dom.chatForm.requestSubmit();
    }
  });

  dom.chatForm.addEventListener("submit", (event) => void sendMessage(event));
  dom.cancelBtn.addEventListener("click", cancelStreaming);
  dom.newChatBtn.addEventListener("click", () => {
    state.activeConversationId = null;
    state.messages = [];
    dom.chatTitle.textContent = "Light Chat";
    renderMessages();
    renderConversations();
  });

  dom.loginBtn.addEventListener("click", () => void handleLogin());
  dom.registerBtn.addEventListener("click", () => void handleRegister());
  dom.logoutBtn.addEventListener("click", () => void handleLogout());
  dom.editionSelect?.addEventListener("change", (event) => {
    const target = event.target;
    setEdition(target?.value === "light" ? "light" : "flash");
  });

  dom.quickActionsBtn?.addEventListener("click", () => {
    if (!dom.quickActionsMenu) return;
    dom.quickActionsMenu.hidden = !dom.quickActionsMenu.hidden;
  });
  dom.uploadFileBtn?.addEventListener("click", () => {
    dom.quickActionsMenu.hidden = true;
    dom.fileInput?.click();
  });
  dom.uploadImageBtn?.addEventListener("click", () => {
    dom.quickActionsMenu.hidden = true;
    dom.imageInput?.click();
  });
  dom.toggleWebSearchBtn?.addEventListener("click", () => {
    state.enableWebSearch = !state.enableWebSearch;
    updateWebSearchUi();
    showToast(`Web search ${state.enableWebSearch ? "enabled" : "disabled"}.`);
  });

  dom.fileInput?.addEventListener("change", async () => {
    await handlePickedFiles(dom.fileInput.files, "file");
    dom.fileInput.value = "";
  });
  dom.imageInput?.addEventListener("change", async () => {
    await handlePickedFiles(dom.imageInput.files, "image");
    dom.imageInput.value = "";
  });

  document.addEventListener("click", (event) => {
    if (!dom.quickActionsMenu || !dom.quickActionsBtn) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (dom.quickActionsMenu.hidden) return;
    if (dom.quickActionsMenu.contains(target) || dom.quickActionsBtn.contains(target)) return;
    dom.quickActionsMenu.hidden = true;
  });
}

async function bootstrap() {
  state.settings.selectedEdition = storage.getSelectedEdition();
  applyLockedRuntimeSettings();
  applyEditionUi();
  updateWebSearchUi();
  renderPendingAttachments();
  updateCharCount();
  autosizePrompt();
  bindEvents();
  renderMessages();
  updateAuthState();
  await checkHealth();
  await loadModels();

  try {
    state.user = await api.me();
  } catch {
    state.user = null;
  }
  dom.chatTitle.textContent = state.user ? "Light Chat" : "Light Chat (Guest)";
  updateAuthState();
  await refreshConversations();
}

bootstrap();
