import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");

const defaultDb = {
  users: [],
  sessions: [],
  conversations: []
};

let initialized = false;
let writeQueue = Promise.resolve();

async function ensureDbFile() {
  if (initialized) return;
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(defaultDb, null, 2), "utf8");
  }
  initialized = true;
}

export async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    conversations: Array.isArray(parsed.conversations) ? parsed.conversations : []
  };
}

export async function writeDb(data) {
  await ensureDbFile();
  writeQueue = writeQueue.then(async () => {
    const tmpPath = `${dbPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpPath, dbPath);
  });
  return writeQueue;
}

