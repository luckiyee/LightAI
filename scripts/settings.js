import { api } from "./api.js";
import { storage } from "./storage.js";

const dom = {
  toastRoot: document.getElementById("toastRoot"),
  settingsStatus: document.getElementById("settingsStatus"),
  authLoggedOut: document.getElementById("authLoggedOut"),
  authLoggedIn: document.getElementById("authLoggedIn"),
  authUsername: document.getElementById("authUsername"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  modelSelect: document.getElementById("modelSelect"),
  temperatureRange: document.getElementById("temperatureRange"),
  temperatureValue: document.getElementById("temperatureValue"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  basePromptInput: document.getElementById("basePromptInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn")
};

const state = {
  user: null,
  models: [],
  prefs: storage.getAllPreferences(),
  dirty: false
};

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  dom.toastRoot.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function setStatus(text, kind = "neutral") {
  dom.settingsStatus.textContent = text;
  dom.settingsStatus.style.color = kind === "error" ? "#b91c1c" : kind === "ok" ? "#166534" : "";
}

function applyAuthUi() {
  const logged = Boolean(state.user);
  dom.authLoggedOut.hidden = logged;
  dom.authLoggedIn.hidden = !logged;
  dom.authUsername.textContent = state.user?.username || "";
}

function applyPrefsToUi() {
  dom.temperatureRange.value = String(state.prefs.temperature);
  dom.temperatureValue.textContent = String(state.prefs.temperature);
  dom.maxTokensInput.value = String(state.prefs.maxTokens);
  dom.basePromptInput.value = state.prefs.basePrompt;
}

function readPrefsFromUi() {
  return {
    selectedModel: dom.modelSelect.value || state.prefs.selectedModel,
    temperature: Number(dom.temperatureRange.value) || 0.7,
    maxTokens: Number(dom.maxTokensInput.value) || 1024,
    basePrompt: dom.basePromptInput.value.trim() || state.prefs.basePrompt
  };
}

function prefsChanged() {
  const current = readPrefsFromUi();
  return (
    current.selectedModel !== state.prefs.selectedModel ||
    current.temperature !== state.prefs.temperature ||
    current.maxTokens !== state.prefs.maxTokens ||
    current.basePrompt !== state.prefs.basePrompt
  );
}

function setDirty(dirty) {
  state.dirty = dirty;
  dom.saveSettingsBtn.disabled = !dirty;
}

async function loadModels() {
  try {
    const payload = await api.getModels();
    state.models = Array.isArray(payload.models) ? payload.models : [];
    dom.modelSelect.innerHTML = "";

    if (!state.models.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models found";
      dom.modelSelect.appendChild(option);
      dom.modelSelect.disabled = true;
      return;
    }

    state.models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      dom.modelSelect.appendChild(option);
    });

    const preferred = state.models.includes(state.prefs.selectedModel)
      ? state.prefs.selectedModel
      : state.models.includes("Light")
        ? "Light"
        : state.models[0];
    state.prefs.selectedModel = preferred;
    dom.modelSelect.value = preferred;
  } catch (error) {
    showToast(`Model load failed: ${error.message}`, "error");
  }
}

function clearAuthFields() {
  dom.usernameInput.value = "";
  dom.passwordInput.value = "";
}

async function doLogin() {
  try {
    const payload = await api.login(dom.usernameInput.value.trim(), dom.passwordInput.value);
    state.user = payload.user || payload;
    clearAuthFields();
    applyAuthUi();
    showToast("Logged in.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function doRegister() {
  try {
    const payload = await api.register(dom.usernameInput.value.trim(), dom.passwordInput.value);
    state.user = payload.user || payload;
    clearAuthFields();
    applyAuthUi();
    showToast("Account created.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function doLogout() {
  try {
    await api.logout();
    state.user = null;
    applyAuthUi();
    showToast("Logged out.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindEvents() {
  dom.loginBtn.addEventListener("click", () => void doLogin());
  dom.registerBtn.addEventListener("click", () => void doRegister());
  dom.logoutBtn.addEventListener("click", () => void doLogout());

  dom.temperatureRange.addEventListener("input", () => {
    dom.temperatureValue.textContent = dom.temperatureRange.value;
    setDirty(prefsChanged());
  });

  const onPrefChange = () => setDirty(prefsChanged());
  dom.modelSelect.addEventListener("change", onPrefChange);
  dom.maxTokensInput.addEventListener("input", onPrefChange);
  dom.basePromptInput.addEventListener("input", onPrefChange);

  dom.saveSettingsBtn.addEventListener("click", () => {
    const next = readPrefsFromUi();
    state.prefs = next;
    storage.setAllPreferences(next);
    setDirty(false);
    dom.saveSettingsBtn.classList.add("success");
    showToast("Preferences saved.");
    window.setTimeout(() => dom.saveSettingsBtn.classList.remove("success"), 900);
  });
}

async function bootstrap() {
  bindEvents();
  applyPrefsToUi();

  try {
    const health = await api.getHealth();
    setStatus(health.ollamaReachable ? "Online" : "Ollama Offline", health.ollamaReachable ? "ok" : "error");
  } catch {
    setStatus("Server Offline", "error");
  }

  try {
    state.user = await api.me();
  } catch {
    state.user = null;
  }
  applyAuthUi();
  await loadModels();
  applyPrefsToUi();
  setDirty(false);
}

bootstrap();
