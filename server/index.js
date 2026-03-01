import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import authRouter from "./routes/auth.js";
import conversationsRouter from "./routes/conversations.js";
import { HttpError } from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(rootDir));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api", chatRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/chat", (_req, res) => {
  res.sendFile(path.join(rootDir, "chat.html"));
});

app.get("/settings", (_req, res) => {
  res.sendFile(path.join(rootDir, "settings.html"));
});

app.get("/pricing", (_req, res) => {
  res.sendFile(path.join(rootDir, "pricing.html"));
});

app.get("/tos", (_req, res) => {
  res.sendFile(path.join(rootDir, "tos.html"));
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(rootDir, "privacy.html"));
});

app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.status || 500;
  res.status(status).json({ error: err.message || "Unexpected server error." });
});

app.listen(port, () => {
  process.stdout.write(`LightAI is running on http://localhost:${port}\n`);
});
