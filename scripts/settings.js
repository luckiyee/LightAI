import { api } from "./api.js";

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
  logoutBtn: document.getElementById("logoutBtn")
};

const state = {
  user: null
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
}

async function bootstrap() {
  bindEvents();

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
}

bootstrap();
