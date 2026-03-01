const KEYS = {
  selectedModel: "lightai.selectedModel",
  temperature: "lightai.temperature",
  maxTokens: "lightai.maxTokens",
  basePrompt: "lightai.basePrompt"
};

const DEFAULTS = {
  selectedModel: "Light",
  temperature: 0.7,
  maxTokens: 1024,
  basePrompt:
    "You are Light version 0.1, a helpful, concise, and accurate AI assistant. " +
    "Respond clearly, prioritize practical answers, and ask brief clarifying questions only when needed."
};

function readNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const storage = {
  getSelectedModel() {
    return localStorage.getItem(KEYS.selectedModel) || DEFAULTS.selectedModel;
  },
  setSelectedModel(value) {
    localStorage.setItem(KEYS.selectedModel, String(value || DEFAULTS.selectedModel));
  },

  getTemperature() {
    return readNumber(KEYS.temperature, DEFAULTS.temperature);
  },
  setTemperature(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : DEFAULTS.temperature;
    localStorage.setItem(KEYS.temperature, String(safe));
  },

  getMaxTokens() {
    return readNumber(KEYS.maxTokens, DEFAULTS.maxTokens);
  },
  setMaxTokens(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : DEFAULTS.maxTokens;
    localStorage.setItem(KEYS.maxTokens, String(Math.max(64, Math.min(8192, safe))));
  },

  getBasePrompt() {
    return localStorage.getItem(KEYS.basePrompt) || DEFAULTS.basePrompt;
  },
  setBasePrompt(value) {
    localStorage.setItem(KEYS.basePrompt, String(value || DEFAULTS.basePrompt));
  },

  getAllPreferences() {
    return {
      selectedModel: this.getSelectedModel(),
      temperature: this.getTemperature(),
      maxTokens: this.getMaxTokens(),
      basePrompt: this.getBasePrompt()
    };
  },
  setAllPreferences(prefs) {
    this.setSelectedModel(prefs.selectedModel);
    this.setTemperature(prefs.temperature);
    this.setMaxTokens(prefs.maxTokens);
    this.setBasePrompt(prefs.basePrompt);
  }
};

export { DEFAULTS };
