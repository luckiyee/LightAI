import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createRuntimeStream, getRuntimeModels } from "../lightRuntime.js";

const router = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please wait a moment." }
});

async function searchWeb(query) {
  const endpoint = new URL("https://api.duckduckgo.com/");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("no_html", "1");
  endpoint.searchParams.set("skip_disambig", "1");
  endpoint.searchParams.set("no_redirect", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "LightAI/0.1 (+local)"
    }
  });
  if (!response.ok) {
    throw new Error(`Web search provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const related = Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : [];
  const flattened = related
    .flatMap((item) => (Array.isArray(item.Topics) ? item.Topics : [item]))
    .filter((item) => item && typeof item.Text === "string")
    .slice(0, 5)
    .map((item) => {
      const url = typeof item.FirstURL === "string" ? item.FirstURL : "";
      const text = String(item.Text || "").trim();
      const split = text.split(" - ");
      return {
        title: split[0] || "Source",
        snippet: split.slice(1).join(" - ") || text,
        url
      };
    });

  if (!flattened.length) {
    const abstractText = typeof payload.AbstractText === "string" ? payload.AbstractText.trim() : "";
    const abstractUrl = typeof payload.AbstractURL === "string" ? payload.AbstractURL.trim() : "";
    if (abstractText) {
      return [
        {
          title: "DuckDuckGo",
          snippet: abstractText,
          url: abstractUrl
        }
      ];
    }
    return [];
  }

  return flattened;
}

function sanitizeChatBody(body) {
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const enableWebSearch = Boolean(body.enableWebSearch);
  const temperature = Number(options.temperature);
  const numPredict = Number(options.num_predict);

  if (!model) throw new HttpError(400, "Model is required.");
  if (messages.length === 0) throw new HttpError(400, "At least one message is required.");

  const safeMessages = messages
    .filter((msg) => msg && typeof msg.role === "string" && typeof msg.content === "string")
    .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 8000) }));

  if (safeMessages.length === 0) throw new HttpError(400, "Messages are invalid.");

  const safeAttachments = attachments
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 8)
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.slice(0, 120) : "attachment";
      const content = typeof entry.content === "string" ? entry.content.slice(0, 5000) : "";
      const mimeType = typeof entry.mimeType === "string" ? entry.mimeType.slice(0, 80) : "text/plain";
      const kind = entry.kind === "image" ? "image" : "file";
      return { kind, name, mimeType, content };
    })
    .filter((entry) => entry.content.length > 0);

  return {
    model,
    messages: safeMessages,
    attachments: safeAttachments,
    enableWebSearch,
    options: {
      temperature: Number.isFinite(temperature) ? Math.max(0, Math.min(1.5, temperature)) : 0.7,
      num_predict: Number.isFinite(numPredict) ? Math.max(64, Math.min(8192, numPredict)) : 1024
    }
  };
}

router.get("/models", async (_req, res) => {
  try {
    const models = await getRuntimeModels();
    res.json({ models });
  } catch (error) {
    res.status(502).json({ error: error.message || "Failed to load models from runtime." });
  }
});

router.post("/chat", chatLimiter, async (req, res) => {
  try {
    const payload = sanitizeChatBody(req.body || {});
    const lastUserMessage = [...payload.messages].reverse().find((msg) => msg.role === "user")?.content || "";
    const prependSystem = [];
    let sources = [];

    if (payload.attachments.length > 0) {
      const attachmentBlock = payload.attachments
        .map(
          (entry, index) =>
            `[Attachment ${index + 1}] ${entry.name} (${entry.mimeType})\n${entry.content}`
        )
        .join("\n\n");
      prependSystem.push(
        "The user attached files/images. Use these as source context when relevant:\n" + attachmentBlock
      );
    }

    if (payload.enableWebSearch && lastUserMessage) {
      try {
        sources = await searchWeb(lastUserMessage.slice(0, 300));
        if (sources.length > 0) {
          const webLines = sources.map(
            (source) => `- ${source.title}: ${source.snippet}${source.url ? ` (${source.url})` : ""}`
          );
          prependSystem.push("Web search context (may be incomplete; cite uncertainty when needed):\n" + webLines.join("\n"));
        }
      } catch {
        prependSystem.push("Web search context is currently unavailable.");
      }
    }

    const outboundPayload = {
      ...payload,
      messages: prependSystem.length
        ? [{ role: "system", content: prependSystem.join("\n\n") }, ...payload.messages]
        : payload.messages
    };
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (sources.length > 0) {
      res.write(`${JSON.stringify({ type: "sources", sources })}\n`);
    }

    for await (const chunk of createRuntimeStream(outboundPayload)) {
      res.write(`${JSON.stringify(chunk)}\n`);
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      const status =
        typeof error.status === "number" ? error.status : 502;
      res.status(status).json({ error: error.message || "Chat proxy request failed." });
    } else {
      res.end();
    }
  }
});

export default router;
