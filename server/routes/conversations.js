import { Router } from "express";
import crypto from "node:crypto";
import { HttpError, requireAuth } from "../auth.js";
import { readDb, writeDb } from "../dataStore.js";

const router = Router();

function summarizeTitle(messages) {
  const firstUser = messages.find((msg) => msg.role === "user");
  const text = (firstUser?.content || "New conversation").trim().replace(/\s+/g, " ");
  return text.slice(0, 60);
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, "Conversation messages are required.");
  }
  const safe = messages
    .filter((msg) => msg && typeof msg.role === "string" && typeof msg.content === "string")
    .map((msg) => ({
      role: msg.role,
      content: msg.content.slice(0, 8000)
    }));
  if (safe.length === 0) {
    throw new HttpError(400, "Conversation messages are invalid.");
  }
  return safe;
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const db = await readDb();
    const conversations = db.conversations
      .filter((item) => item.userId === req.user.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
        createdAt: item.createdAt
      }));
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const conversation = db.conversations.find(
      (item) => item.id === req.params.id && item.userId === req.user.id
    );
    if (!conversation) throw new HttpError(404, "Conversation not found.");
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { id, messages, title } = req.body || {};
    const safeMessages = sanitizeMessages(messages);
    const db = await readDb();
    const now = Date.now();
    const safeTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim().slice(0, 60)
        : summarizeTitle(safeMessages);

    let conversation = null;
    if (typeof id === "string" && id.trim()) {
      conversation = db.conversations.find((item) => item.id === id && item.userId === req.user.id);
    }

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        title: safeTitle,
        messages: safeMessages,
        createdAt: now,
        updatedAt: now
      };
      db.conversations.push(conversation);
    } else {
      conversation.title = safeTitle;
      conversation.messages = safeMessages;
      conversation.updatedAt = now;
    }

    await writeDb(db);
    res.status(201).json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const before = db.conversations.length;
    db.conversations = db.conversations.filter(
      (item) => !(item.id === req.params.id && item.userId === req.user.id)
    );
    if (db.conversations.length === before) {
      throw new HttpError(404, "Conversation not found.");
    }
    await writeDb(db);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;

