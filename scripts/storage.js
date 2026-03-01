const SETTINGS_KEY = "lightai.settings";
const HISTORY_KEY = "lightai.history";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { model: "", temperature: 0.7, maxTokens: 1024 };
    }
    const parsed = JSON.parse(raw);
    return {
      model: typeof parsed.model === "string" ? parsed.model : "",
      temperature: Number.isFinite(parsed.temperature) ? parsed.temperature : 0.7,
      maxTokens: Number.isFinite(parsed.maxTokens) ? parsed.maxTokens : 1024
    };
  } catch {
    return { model: "", temperature: 0.7, maxTokens: 1024 };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (msg) =>
        msg &&
        typeof msg.role === "string" &&
        typeof msg.content === "string" &&
        msg.content.length > 0
    );
  } catch {
    return [];
  }
}

export function saveHistory(messages) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-100)));
}
