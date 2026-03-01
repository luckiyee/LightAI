import { getHealth, getModels, streamAssistantReply } from "./api.js";
import { loadHistory, loadSettings, saveHistory, saveSettings } from "./storage.js";

const dom = {
  statusPill: document.getElementById("statusPill"),
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
  models: [],
  messages: [],
  settings: loadSettings(),
  controller: null,
  streaming: false,
  lastUserMessage: ""
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
  dom.sendBtn.disabled = streaming;
  dom.retryBtn.disabled = streaming;
  dom.cancelBtn.disabled = !streaming;
  dom.promptInput.disabled = streaming;
  dom.sendBtn.textContent = streaming ? "Sending..." : "Send";
}

function renderMessages() {
  dom.chatMessages.innerHTML = "";
  if (state.messages.length === 0) {
    appendSystemMessage("Start chatting with LightAI. Pick a model and send a prompt.");
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
  roleLabel.textContent = role === "user" ? "You" : role === "assistant" ? "LightAI" : "System";
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

function upsertAssistantMessage(content) {
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    last.content = content;
  } else {
    state.messages.push({ role: "assistant", content });
  }
  saveHistory(state.messages);
  renderMessages();
}

function syncSettingsToUi() {
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
      : models[0];
    state.settings.model = preferred;
    dom.modelSelect.value = preferred;
    persistSettings();
    const hasSelected = models.includes(preferred);
    if (!hasSelected) {
      updateStatus("Selected model unavailable. Pick another model.", "error");
    }
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

  const content = dom.promptInput.value.trim();
  if (!content) return;
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
  saveHistory(state.messages);

  let assistantContent = "";
  state.controller = new AbortController();
  setStreamingState(true);

  try {
    const stream = streamAssistantReply({
      messages: state.messages.filter((m) => m.role !== "system"),
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
    saveHistory(state.messages);
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

function handleKeyboardSubmit(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    dom.chatForm.requestSubmit();
  }
}

function bindEvents() {
  dom.chatForm.addEventListener("submit", sendMessage);
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
    state.messages = [];
    saveHistory(state.messages);
    renderMessages();
  });

  dom.clearChatBtn.addEventListener("click", () => {
    state.messages = [];
    saveHistory(state.messages);
    dom.chatMessages.innerHTML = "";
    appendSystemMessage("Chat cleared.");
  });
}

async function bootstrap() {
  state.messages = loadHistory();
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
  await checkHealth();
  await refreshModels();
}

bootstrap();
