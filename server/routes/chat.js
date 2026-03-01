import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth.js";
import { createChatStream, listModels } from "../ollamaClient.js";

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

function sanitizeChatBody(body) {
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const temperature = Number(options.temperature);
  const numPredict = Number(options.num_predict);

  if (!model) throw new HttpError(400, "Model is required.");
  if (messages.length === 0) throw new HttpError(400, "At least one message is required.");

  const safeMessages = messages
    .filter((msg) => msg && typeof msg.role === "string" && typeof msg.content === "string")
    .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 8000) }));

  if (safeMessages.length === 0) throw new HttpError(400, "Messages are invalid.");

  return {
    model,
    messages: safeMessages,
    options: {
      temperature: Number.isFinite(temperature) ? Math.max(0, Math.min(1.5, temperature)) : 0.7,
      num_predict: Number.isFinite(numPredict) ? Math.max(64, Math.min(8192, numPredict)) : 1024
    }
  };
}

router.get("/models", async (_req, res) => {
  try {
    const models = await listModels();
    res.json({ models });
  } catch (error) {
    res.status(502).json({ error: error.message || "Failed to load models from Ollama." });
  }
});

router.post("/chat", requireAuth, chatLimiter, async (req, res) => {
  let clearTimeout = null;

  try {
    const payload = sanitizeChatBody(req.body || {});
    const streamResult = await createChatStream(payload);
    clearTimeout = streamResult.clearTimeout;

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = streamResult.response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
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
  } finally {
    if (typeof clearTimeout === "function") {
      clearTimeout();
    }
  }
});

export default router;
