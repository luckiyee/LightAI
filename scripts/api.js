const JSON_HEADERS = { "Content-Type": "application/json" };

async function rawJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(text || "Unexpected server response.");
  }
  return response.json();
}

async function parseJsonResponse(response) {
  const data = await rawJson(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function getHealth() {
  const response = await fetch("/api/health", { credentials: "same-origin" });
  return parseJsonResponse(response);
}

export async function getModels() {
  const response = await fetch("/api/models", { credentials: "same-origin" });
  const data = await parseJsonResponse(response);
  return Array.isArray(data.models) ? data.models : [];
}

export async function registerUser(username, password) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "same-origin",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password })
  });
  const data = await parseJsonResponse(response);
  return data.user;
}

export async function loginUser(username, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password })
  });
  const data = await parseJsonResponse(response);
  return data.user;
}

export async function logoutUser() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  });
  await parseJsonResponse(response);
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (response.status === 401) {
    return null;
  }
  const data = await parseJsonResponse(response);
  return data.user || null;
}

export async function listConversations() {
  const response = await fetch("/api/conversations", { credentials: "same-origin" });
  const data = await parseJsonResponse(response);
  return Array.isArray(data.conversations) ? data.conversations : [];
}

export async function getConversation(id) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    credentials: "same-origin"
  });
  const data = await parseJsonResponse(response);
  return data.conversation;
}

export async function saveConversation({ id, title, messages }) {
  const response = await fetch("/api/conversations", {
    method: "POST",
    credentials: "same-origin",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id, title, messages })
  });
  const data = await parseJsonResponse(response);
  return data.conversation;
}

export async function deleteConversation(id) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  await parseJsonResponse(response);
}

export async function* streamAssistantReply({ messages, model, temperature, maxTokens, signal }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
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
