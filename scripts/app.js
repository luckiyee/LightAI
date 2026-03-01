import {
  deleteConversation,
  getConversation,
  getCurrentUser,
  getHealth,
  getModels,
  listConversations,
  loginUser,
  logoutUser,
  registerUser,
  saveConversation,
  streamAssistantReply
} from "./api.js";
import { loadSettings, saveSettings } from "./storage.js";

const ASSISTANT_NAME = "Light";
const ASSISTANT_VERSION = "0.1";
const ADMIN_PASSWORD = "Kli-T10-Pmo";
const DEFAULT_BASE_PROMPT =
  `You are ${ASSISTANT_NAME} version ${ASSISTANT_VERSION}, a helpful, concise, and accurate AI assistant. ` +
  "Respond clearly, prioritize practical answers, and ask brief clarifying questions only when needed.";

const dom = {
  statusPill: document.getElementById("statusPill"),
  authLoggedOut: document.getElementById("authLoggedOut"),
  authLoggedIn: document.getElementById("authLoggedIn"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  authUsername: document.getElementById("authUsername"),
  logoutBtn: document.getElementById("logoutBtn"),
  conversationList: document.getElementById("conversationList"),
  modelSelect: document.getElementById("modelSelect"),
  temperatureRange: document.getElementById("temperatureRange"),
  temperatureValue: document.getElementById("temperatureValue"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  promptInput: document.getElementById("promptInput"),
  charCount: document.getElementById("charCount"),
  sendBtn: document.getElementById("sendBtn"),
  retryBtn: document.getElementById("retryBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  messageTemplate: document.getElementById("messageTemplate")
};

const state = {
  user: null,
  models: [],
  conversations: [],
  activeConversationId: null,
  messages: [],
  settings: loadSettings(),
  controller: null,
  streaming: false,
  lastUserMessage: "",
  awaitingBasePrompt: false
};

function updateStatus(text, kind = "neutral") {
  dom.statusPill.textContent = text;
  if (kind === "ok") {
    dom.statusPill.style.background = "#e8f8e9";
    dom.statusPill.style.color = "#1f6c31";
  } else if (kind === "error") {
    dom.statusPill.style.background = "#feecec";
    dom.statusPill.style.color = "#9f2222";
  } else {
    dom.statusPill.style.background = "";
    dom.statusPill.style.color = "";
  }
}

function setStreamingState(streaming) {
  state.streaming = streaming;
  dom.sendBtn.disabled = streaming || !state.user;
  dom.retryBtn.disabled = streaming;
  dom.cancelBtn.disabled = !streaming;
  dom.promptInput.disabled = streaming || !state.user;
  dom.sendBtn.textContent = streaming ? "Sending..." : "Send";
}

function renderMessages() {
  dom.chatMessages.innerHTML = "";
  if (state.messages.length === 0) {
    if (!state.user) {
      appendSystemMessage("Log in or create an account to start chatting.");
    } else {
      appendSystemMessage("Start chatting with LightAI. Pick a model and send a prompt.");
    }
    return;
  }

  for (const message of state.messages) {
    const element = createMessageElement(message.role, message.content);
    dom.chatMessages.appendChild(element);
  }
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function createMessageElement(role, content) {
  const fragment = dom.messageTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const roleLabel = fragment.querySelector(".role-label");
  const contentEl = fragment.querySelector(".message-content");
  const copyBtn = fragment.querySelector(".copy-btn");

  article.classList.add(role);
  roleLabel.textContent =
    role === "user"
      ? "You"
      : role === "assistant"
        ? `${ASSISTANT_NAME} v${ASSISTANT_VERSION}`
        : "System";
  contentEl.textContent = content;

  if (role === "assistant") {
    copyBtn.hidden = false;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(contentEl.textContent || "");
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      } catch {
        copyBtn.textContent = "Failed";
      }
    });
  }

  return article;
}

function appendSystemMessage(content) {
  const element = createMessageElement("system", content);
  dom.chatMessages.appendChild(element);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function renderConversationList() {
  dom.conversationList.innerHTML = "";
  if (!state.user) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Login required.";
    dom.conversationList.appendChild(empty);
    return;
  }
  if (state.conversations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No saved conversations yet.";
    dom.conversationList.appendChild(empty);
    return;
  }

  for (const convo of state.conversations) {
    const row = document.createElement("div");
    row.className = "conversation-item";
    if (convo.id === state.activeConversationId) row.classList.add("active");

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "conversation-open";
    selectBtn.textContent = convo.title || "Untitled";
    selectBtn.addEventListener("click", () => void loadConversationById(convo.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "conversation-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => void deleteConversationById(convo.id));

    row.appendChild(selectBtn);
    row.appendChild(deleteBtn);
    dom.conversationList.appendChild(row);
  }
}

function applyAuthUiState() {
  const authed = Boolean(state.user);
  dom.authLoggedOut.hidden = authed;
  dom.authLoggedIn.hidden = !authed;
  dom.authUsername.textContent = state.user?.username || "";
  dom.modelSelect.disabled = !authed || dom.modelSelect.options.length === 0;
  dom.temperatureRange.disabled = !authed;
  dom.maxTokensInput.disabled = !authed;
  dom.newChatBtn.disabled = !authed;
  dom.clearChatBtn.disabled = !authed;
  dom.promptInput.disabled = !authed || state.streaming;
  dom.sendBtn.disabled = !authed || state.streaming;
  dom.retryBtn.disabled = !authed || state.streaming;
  renderConversationList();
}

function upsertAssistantMessage(content) {
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    last.content = content;
  } else {
    state.messages.push({ role: "assistant", content });
  }
  renderMessages();
}

function syncSettingsToUi() {
  if (!state.settings.basePrompt) {
    state.settings.basePrompt = DEFAULT_BASE_PROMPT;
  }
  dom.temperatureRange.value = String(state.settings.temperature);
  dom.temperatureValue.textContent = String(state.settings.temperature);
  dom.maxTokensInput.value = String(state.settings.maxTokens);
}

function persistSettings() {
  saveSettings(state.settings);
}

function updateCharCount() {
  const count = dom.promptInput.value.length;
  dom.charCount.textContent = `${count} / 4000`;
}

async function refreshModels() {
  try {
    const models = await getModels();
    state.models = models;
    dom.modelSelect.innerHTML = "";

    for (const model of models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      dom.modelSelect.appendChild(option);
    }

    if (models.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models found";
      dom.modelSelect.appendChild(option);
      dom.modelSelect.disabled = true;
      updateStatus("Proxy online, but no local models found", "error");
      return;
    }

    dom.modelSelect.disabled = false;
    const preferred = state.settings.model && models.includes(state.settings.model)
      ? state.settings.model
      : models.includes(ASSISTANT_NAME)
        ? ASSISTANT_NAME
        : models[0];
    state.settings.model = preferred;
    dom.modelSelect.value = preferred;
    persistSettings();
    const hasSelected = models.includes(preferred);
    if (!hasSelected) {
      updateStatus("Selected model unavailable. Pick another model.", "error");
    }
    applyAuthUiState();
  } catch (error) {
    appendSystemMessage(`Could not load models: ${error.message}`);
  }
}

async function checkHealth() {
  try {
    const health = await getHealth();
    const ok = Boolean(health.proxy) && Boolean(health.ollamaReachable);
    if (ok) {
      updateStatus(`Online • ${health.ollamaBaseUrl}`, "ok");
    } else {
      updateStatus("Proxy online, Ollama unreachable", "error");
    }
  } catch (error) {
    updateStatus(`Offline: ${error.message}`, "error");
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.streaming) return;
  if (!state.user) {
    appendSystemMessage("Login required before sending messages.");
    return;
  }

  const content = dom.promptInput.value.trim();
  if (!content) return;

  if (content === ADMIN_PASSWORD) {
    state.awaitingBasePrompt = true;
    dom.promptInput.value = "";
    updateCharCount();
    appendSystemMessage("Password accepted. Send your new base prompt in the next message.");
    return;
  }

  if (state.awaitingBasePrompt) {
    state.settings.basePrompt = content;
    state.awaitingBasePrompt = false;
    persistSettings();
    dom.promptInput.value = "";
    updateCharCount();
    appendSystemMessage(`${ASSISTANT_NAME} base prompt updated.`);
    return;
  }

  if (content.length > 4000) {
    appendSystemMessage("Prompt is too long. Keep it within 4000 characters.");
    return;
  }
  if (!state.settings.model) {
    appendSystemMessage("Select a valid model before sending.");
    return;
  }

  state.messages.push({ role: "user", content });
  state.lastUserMessage = content;
  dom.promptInput.value = "";
  updateCharCount();
  renderMessages();

  let assistantContent = "";
  state.controller = new AbortController();
  setStreamingState(true);

  try {
    const payloadMessages = [
      { role: "system", content: state.settings.basePrompt || DEFAULT_BASE_PROMPT },
      ...state.messages.filter((m) => m.role === "user" || m.role === "assistant")
    ];
    const stream = streamAssistantReply({
      messages: payloadMessages,
      model: state.settings.model,
      temperature: state.settings.temperature,
      maxTokens: state.settings.maxTokens,
      signal: state.controller.signal
    });

    for await (const chunk of stream) {
      if (chunk.type === "token") {
        assistantContent += chunk.content;
        upsertAssistantMessage(assistantContent);
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      appendSystemMessage("Generation cancelled.");
    } else {
      appendSystemMessage(`Error: ${error.message}`);
    }
  } finally {
    setStreamingState(false);
    state.controller = null;
    await persistConversation();
  }
}

function cancelStreaming() {
  if (state.controller) {
    state.controller.abort();
  }
}

function retryLastMessage() {
  if (state.streaming) return;
  if (!state.lastUserMessage) {
    appendSystemMessage("No previous user message found to retry.");
    return;
  }
  dom.promptInput.value = state.lastUserMessage;
  updateCharCount();
  dom.chatForm.requestSubmit();
}

async function persistConversation() {
  if (!state.user) return;
  const safeMessages = state.messages.filter(
    (msg) => msg.role === "user" || msg.role === "assistant"
  );
  if (safeMessages.length === 0) return;
  const saved = await saveConversation({
    id: state.activeConversationId,
    title: safeMessages.find((msg) => msg.role === "user")?.content || "New conversation",
    messages: safeMessages
  });
  state.activeConversationId = saved.id;
  await refreshConversations();
}

async function refreshConversations() {
  if (!state.user) {
    state.conversations = [];
    renderConversationList();
    return;
  }
  state.conversations = await listConversations();
  renderConversationList();
}

async function loadConversationById(id) {
  try {
    const conversation = await getConversation(id);
    state.activeConversationId = conversation.id;
    state.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role === "user") {
        state.lastUserMessage = state.messages[i].content;
        break;
      }
    }
    renderConversationList();
    renderMessages();
  } catch (error) {
    appendSystemMessage(`Failed to load conversation: ${error.message}`);
  }
}

async function deleteConversationById(id) {
  try {
    await deleteConversation(id);
    if (state.activeConversationId === id) {
      state.activeConversationId = null;
      state.messages = [];
      renderMessages();
    }
    await refreshConversations();
  } catch (error) {
    appendSystemMessage(`Failed to delete conversation: ${error.message}`);
  }
}

function clearAuthFields() {
  dom.usernameInput.value = "";
  dom.passwordInput.value = "";
}

async function handleRegister() {
  try {
    const username = dom.usernameInput.value.trim();
    const password = dom.passwordInput.value;
    const user = await registerUser(username, password);
    state.user = user;
    clearAuthFields();
    state.messages = [];
    state.activeConversationId = null;
    renderMessages();
    await refreshConversations();
    applyAuthUiState();
  } catch (error) {
    appendSystemMessage(`Register failed: ${error.message}`);
  }
}

async function handleLogin() {
  try {
    const username = dom.usernameInput.value.trim();
    const password = dom.passwordInput.value;
    const user = await loginUser(username, password);
    state.user = user;
    clearAuthFields();
    state.messages = [];
    state.activeConversationId = null;
    renderMessages();
    await refreshConversations();
    applyAuthUiState();
  } catch (error) {
    appendSystemMessage(`Login failed: ${error.message}`);
  }
}

async function handleLogout() {
  try {
    await logoutUser();
    state.user = null;
    state.messages = [];
    state.activeConversationId = null;
    state.conversations = [];
    renderMessages();
    applyAuthUiState();
  } catch (error) {
    appendSystemMessage(`Logout failed: ${error.message}`);
  }
}

function handleKeyboardSubmit(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    dom.chatForm.requestSubmit();
  }
}

function bindEvents() {
  dom.chatForm.addEventListener("submit", sendMessage);
  dom.loginBtn.addEventListener("click", () => void handleLogin());
  dom.registerBtn.addEventListener("click", () => void handleRegister());
  dom.logoutBtn.addEventListener("click", () => void handleLogout());
  dom.retryBtn.addEventListener("click", retryLastMessage);
  dom.cancelBtn.addEventListener("click", cancelStreaming);
  dom.promptInput.addEventListener("keydown", handleKeyboardSubmit);
  dom.promptInput.addEventListener("input", updateCharCount);

  dom.temperatureRange.addEventListener("input", () => {
    state.settings.temperature = Number(dom.temperatureRange.value);
    dom.temperatureValue.textContent = String(state.settings.temperature);
    persistSettings();
  });

  dom.maxTokensInput.addEventListener("change", () => {
    const value = Number(dom.maxTokensInput.value);
    state.settings.maxTokens = Number.isFinite(value) ? Math.max(64, Math.min(8192, value)) : 1024;
    dom.maxTokensInput.value = String(state.settings.maxTokens);
    persistSettings();
  });

  dom.modelSelect.addEventListener("change", () => {
    state.settings.model = dom.modelSelect.value;
    persistSettings();
  });

  dom.newChatBtn.addEventListener("click", () => {
    state.activeConversationId = null;
    state.messages = [];
    renderMessages();
    renderConversationList();
  });

  dom.clearChatBtn.addEventListener("click", () => {
    state.activeConversationId = null;
    state.messages = [];
    dom.chatMessages.innerHTML = "";
    appendSystemMessage("Chat cleared.");
    renderConversationList();
  });
}

async function bootstrap() {
  state.messages = [];
  if (!state.settings.basePrompt) {
    state.settings.basePrompt = DEFAULT_BASE_PROMPT;
    persistSettings();
  }
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i].role === "user") {
      state.lastUserMessage = state.messages[i].content;
      break;
    }
  }
  syncSettingsToUi();
  updateCharCount();
  bindEvents();
  renderMessages();
  applyAuthUiState();
  await checkHealth();
  await refreshModels();
  try {
    state.user = await getCurrentUser();
  } catch {
    state.user = null;
  }
  await refreshConversations();
  applyAuthUiState();
}

bootstrap();
