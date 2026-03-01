import { URL } from "node:url";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function toOllamaUrl(pathname) {
  return new URL(pathname, OLLAMA_BASE_URL).toString();
}

export async function checkOllamaHealth() {
  const timeout = createTimeoutSignal(5000);
  try {
    const response = await fetch(toOllamaUrl("/api/tags"), { signal: timeout.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.clear();
  }
}

export async function listModels() {
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(toOllamaUrl("/api/tags"), { signal: timeout.signal });
    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }
    const payload = await response.json();
    return (payload.models || []).map((model) => model.name).filter(Boolean);
  } finally {
    timeout.clear();
  }
}

export async function createChatStream(payload) {
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(toOllamaUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        stream: true
      }),
      signal: timeout.signal
    });

    if (!response.ok) {
      let message = `Ollama returned HTTP ${response.status}.`;
      try {
        const data = await response.json();
        message = data.error || message;
      } catch {
        // ignore parse failures
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error("Ollama did not return a stream.");
    }

    return { response, clearTimeout: timeout.clear };
  } catch (error) {
    timeout.clear();
    throw error;
  }
}

export function getOllamaBaseUrl() {
  return OLLAMA_BASE_URL;
}
