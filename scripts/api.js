const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (!response.ok) throw new Error(text || "Request failed.");
    return text;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed.");
  }
  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: options.body ? JSON_HEADERS : undefined,
    ...options
  });
  return parseResponse(response);
}

export const api = {
  getHealth() {
    return request("/api/health");
  },
  getModels() {
    return request("/api/models");
  },
  register(username, password) {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  login(username, password) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  logout() {
    return request("/api/auth/logout", { method: "POST" });
  },
  async me() {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    if (response.status === 401) return null;
    const payload = await parseResponse(response);
    return payload.user || null;
  },
  listConversations() {
    return request("/api/conversations");
  },
  getConversation(id) {
    return request(`/api/conversations/${encodeURIComponent(id)}`);
  },
  saveConversation(data) {
    return request("/api/conversations", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },
  deleteConversation(id) {
    return request(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
};

export async function* streamChat({
  messages,
  model,
  temperature,
  maxTokens,
  signal,
  enableWebSearch = false,
  attachments = []
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    signal,
    body: JSON.stringify({
      model,
      messages,
      enableWebSearch: Boolean(enableWebSearch),
      attachments: Array.isArray(attachments) ? attachments : [],
      options: {
        temperature,
        num_predict: maxTokens
      }
    })
  });

  if (!response.ok) {
    let errorMessage = "Chat request failed.";
    try {
      const body = await response.json();
      errorMessage = body.error || errorMessage;
    } catch {
      const text = await response.text();
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("ReadableStream is not supported in this browser.");
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

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (payload.error) throw new Error(payload.error);
      if (payload.type === "sources" && Array.isArray(payload.sources)) {
        yield { type: "sources", sources: payload.sources };
      }
      if (payload?.message?.content) {
        yield { type: "token", content: payload.message.content };
      }
      if (payload.done) {
        yield { type: "done" };
        return;
      }
    }
  }

  if (buffer.trim()) {
    try {
      const payload = JSON.parse(buffer.trim());
      if (payload?.message?.content) {
        yield { type: "token", content: payload.message.content };
      }
    } catch {
      // ignore trailing malformed chunk
    }
  }

  yield { type: "done" };
}
