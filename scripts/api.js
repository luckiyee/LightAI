const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(text || "Unexpected server response.");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function getHealth() {
  const response = await fetch("/api/health");
  return parseJsonResponse(response);
}

export async function getModels() {
  const response = await fetch("/api/models");
  const data = await parseJsonResponse(response);
  return Array.isArray(data.models) ? data.models : [];
}

export async function* streamAssistantReply({ messages, model, temperature, maxTokens, signal }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: JSON_HEADERS,
    signal,
    body: JSON.stringify({
      model,
      messages,
      options: {
        temperature,
        num_predict: maxTokens
      }
    })
  });

  if (!response.ok) {
    let errorMessage = "Chat request failed.";
    try {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } catch {
      const text = await response.text();
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Streaming not supported in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const payload = JSON.parse(trimmed);
        if (payload.error) {
          throw new Error(payload.error);
        }
        const delta = payload?.message?.content ?? "";
        const isDone = Boolean(payload?.done);
        if (delta) {
          yield { type: "token", content: delta };
        }
        if (isDone) {
          yield { type: "done" };
          return;
        }
      } catch (err) {
        throw new Error(err.message || "Failed to parse stream response.");
      }
    }
  }

  if (buffer.trim().length > 0) {
    const payload = JSON.parse(buffer.trim());
    if (payload?.message?.content) {
      yield { type: "token", content: payload.message.content };
    }
  }

  yield { type: "done" };
}
