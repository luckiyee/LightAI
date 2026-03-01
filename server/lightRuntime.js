import { Ollama } from "ollama";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

const client = new Ollama({
  host: OLLAMA_BASE_URL,
  headers: OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : undefined
});

async function withTimeout(task, timeoutMs, message) {
  return await Promise.race([
    task,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function toRuntimeError(error) {
  const base = String(error?.message || "Ollama runtime failed.");
  if (/api key|unauthorized|forbidden/i.test(base)) {
    return new Error("Ollama auth failed. Set a valid OLLAMA_API_KEY.");
  }
  if (/fetch|connect|econnrefused|network/i.test(base)) {
    return new Error(
      `Cannot reach Ollama at ${OLLAMA_BASE_URL}. Start Ollama locally or set OLLAMA_BASE_URL to a reachable Ollama endpoint.`
    );
  }
  return new Error(base);
}

export async function getRuntimeHealth() {
  try {
    await withTimeout(client.list(), 6000, "Runtime health check timed out.");
    return { provider: "ollama", reachable: true };
  } catch {
    return { provider: "ollama", reachable: false };
  }
}

export async function getRuntimeModels() {
  try {
    const result = await withTimeout(client.list(), REQUEST_TIMEOUT_MS, "Listing Ollama models timed out.");
    const models = Array.isArray(result?.models) ? result.models.map((entry) => entry.name).filter(Boolean) : [];
    return models;
  } catch (error) {
    throw toRuntimeError(error);
  }
}

export async function* createRuntimeStream(payload) {
  try {
    const stream = await withTimeout(
      client.chat({
        model: payload.model,
        messages: payload.messages,
        options: payload.options,
        stream: true
      }),
      REQUEST_TIMEOUT_MS,
      "Ollama chat request timed out."
    );

    for await (const part of stream) {
      yield part;
    }
  } catch (error) {
    throw toRuntimeError(error);
  }
}
