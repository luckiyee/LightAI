import { api, streamChat } from "./api.js";
import { storage, DEFAULTS } from "./storage.js";

const ADMIN_PASSWORD = "Kli-T10-Pmo";
const GUEST_MAX_MESSAGES = 5;

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
  clearChatBtn: document.getElementById("clearChatBtn"),
  modelSelect: document.getElementById("modelSelect"),
  temperatureRange: document.getElementById("temperatureRange"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  promptInput: document.getElementById("promptInput"),
  charCount: document.getElementById("charCount"),
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
  stickToBottom: true
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
  const hasModel = Boolean(dom.modelSelect.value || state.settings.selectedModel);
  dom.promptInput.disabled = !hasModel || state.streaming;
  dom.sendBtn.hidden = state.streaming;
  dom.cancelBtn.hidden = !state.streaming;
  dom.sendBtn.disabled = !hasModel || state.streaming;
  dom.newChatBtn.disabled = state.streaming;
  dom.clearChatBtn.disabled = state.streaming;
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
  dom.charCount.textContent = `${dom.promptInput.value.length} / 4000`;
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
  const copyBtn = fragment.querySelector(".copy-btn");
  const retryBtn = fragment.querySelector(".retry-btn");

  article.classList.add(role);
  if (options.typing) contentEl.classList.add("typing-cursor");

  if (role === "system") {
    avatar.remove();
    body.style.maxWidth = "100%";
    copyBtn.remove();
    retryBtn.remove();
  }

  if (role === "user") {
    copyBtn.remove();
    retryBtn.remove();
  }

  if (role === "ai") {
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
        ? "Start a new conversation with Light."
        : `Guest mode enabled. You can send up to ${GUEST_MAX_MESSAGES} messages before login.`
    );
    dom.chatMessages.appendChild(article);
    maybeScrollToBottom(true);
    return;
  }

  for (const message of state.messages) {
    const role = message.role === "assistant" ? "ai" : message.role;
    const { article } = makeMessageNode(role, message.content);
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

function applySettingsToUi() {
  dom.temperatureRange.value = String(state.settings.temperature);
  dom.maxTokensInput.value = String(state.settings.maxTokens);
}

function persistSettingsFromUi() {
  state.settings.temperature = Number(dom.temperatureRange.value) || DEFAULTS.temperature;
  state.settings.maxTokens = Number(dom.maxTokensInput.value) || DEFAULTS.maxTokens;
  state.settings.selectedModel = dom.modelSelect.value || state.settings.selectedModel;
  storage.setAllPreferences(state.settings);
}

async function loadModels() {
  try {
    const result = await api.getModels();
    const models = Array.isArray(result.models) ? result.models : [];
    state.models = models;
    dom.modelSelect.innerHTML = "";

    if (!models.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models found";
      dom.modelSelect.appendChild(option);
      dom.modelSelect.disabled = true;
      return;
    }

    for (const model of models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      dom.modelSelect.appendChild(option);
    }

    const preferred = models.includes(state.settings.selectedModel)
      ? state.settings.selectedModel
      : models.includes("Light")
        ? "Light"
        : models[0];
    state.settings.selectedModel = preferred;
    dom.modelSelect.value = preferred;
    persistSettingsFromUi();
  } catch (error) {
    showToast(`Model load failed: ${error.message}`, "error");
  }
}

async function checkHealth() {
  try {
    const health = await api.getHealth();
    if (health.ollamaReachable) {
      setStatus("Online", "ok");
    } else {
      setStatus("Ollama unreachable", "error");
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

function appendMessageToState(role, content) {
  state.messages.push({ role, content });
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

  const content = dom.promptInput.value.trim();
  if (!content) return;

  if (!state.user && getGuestMessageCount() >= GUEST_MAX_MESSAGES) {
    showToast(`Guest limit reached (${GUEST_MAX_MESSAGES}). Login to continue.`, "error", 4200);
    appendSystemMessage(
      `You reached the guest limit (${GUEST_MAX_MESSAGES} messages). Login or register to keep chatting and save conversations.`
    );
    return;
  }

  if (content === ADMIN_PASSWORD) {
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

  state.lastUserMessage = content;
  appendMessageToState("user", content);

  dom.promptInput.value = "";
  updateCharCount();
  autosizePrompt();

  const { article, contentEl } = makeMessageNode("ai", "", { typing: true });
  dom.chatMessages.appendChild(article);
  maybeScrollToBottom();

  state.abortController = new AbortController();
  state.streaming = true;
  updateComposerState();

  let assistantText = "";
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
        signal: state.abortController.signal
      })) {
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
      const fallbackModel = state.models.includes("llama3.1:8b")
        ? "llama3.1:8b"
        : state.models.find(Boolean);

      if (!looksLikeRuntimeCrash || !fallbackModel || fallbackModel === activeModel) {
        throw primaryError;
      }

      showToast(`Model failed (${activeModel}). Retrying with ${fallbackModel}...`, "error", 4000);
      assistantText = "";
      contentEl.textContent = "";
      activeModel = fallbackModel;
      await runStream(fallbackModel, Math.min(Number(state.settings.maxTokens) || 256, 256));
      state.settings.selectedModel = fallbackModel;
      dom.modelSelect.value = fallbackModel;
      persistSettingsFromUi();
      appendSystemMessage(`Switched model to ${fallbackModel} after runtime failure.`);
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
    appendMessageToState("assistant", assistantText);
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
  dom.clearChatBtn.addEventListener("click", () => {
    state.messages = [];
    renderMessages();
  });

  dom.loginBtn.addEventListener("click", () => void handleLogin());
  dom.registerBtn.addEventListener("click", () => void handleRegister());
  dom.logoutBtn.addEventListener("click", () => void handleLogout());

  dom.modelSelect.addEventListener("change", () => {
    persistSettingsFromUi();
  });
  dom.temperatureRange.addEventListener("change", () => {
    persistSettingsFromUi();
  });
  dom.maxTokensInput.addEventListener("change", () => {
    persistSettingsFromUi();
  });
}

async function bootstrap() {
  applySettingsToUi();
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
