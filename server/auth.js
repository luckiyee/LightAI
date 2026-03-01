import crypto from "node:crypto";
import { readDb, writeDb } from "./dataStore.js";

export const SESSION_COOKIE_NAME = "lightai_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseCookies(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rest.join("=").trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const iterations = 210000;
  const keylen = 64;
  const digest = "sha512";
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString("hex");
  return { salt, iterations, keylen, digest, hash };
}

function verifyPassword(password, hashed) {
  const verifyHash = crypto
    .pbkdf2Sync(password, hashed.salt, hashed.iterations, hashed.keylen, hashed.digest)
    .toString("hex");
  const left = Buffer.from(verifyHash, "hex");
  const right = Buffer.from(hashed.hash, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sanitizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function pruneExpiredSessions(db) {
  const now = Date.now();
  const activeSessions = db.sessions.filter((session) => session.expiresAt > now);
  if (activeSessions.length !== db.sessions.length) {
    db.sessions = activeSessions;
    await writeDb(db);
  }
}

export async function registerUser(username, password) {
  const cleanUsername = sanitizeUsername(username);
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 32) {
    throw new HttpError(400, "Username must be 3-32 characters.");
  }
  if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
    throw new HttpError(400, "Username may use letters, numbers, dot, underscore, and dash.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new HttpError(400, "Password must be 8-128 characters.");
  }

  const db = await readDb();
  const exists = db.users.some((user) => user.username === cleanUsername);
  if (exists) {
    throw new HttpError(409, "Username already exists.");
  }

  const userId = crypto.randomUUID();
  db.users.push({
    id: userId,
    username: cleanUsername,
    password: createPasswordHash(password),
    createdAt: Date.now()
  });
  await writeDb(db);
  return { id: userId, username: cleanUsername };
}

export async function createSessionForUser(userId) {
  const db = await readDb();
  await pruneExpiredSessions(db);
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS
  });
  await writeDb(db);
  return token;
}

export async function loginUser(username, password) {
  const cleanUsername = sanitizeUsername(username);
  const db = await readDb();
  await pruneExpiredSessions(db);
  const user = db.users.find((item) => item.username === cleanUsername);
  if (!user || !verifyPassword(password, user.password)) {
    throw new HttpError(401, "Invalid username or password.");
  }
  return { id: user.id, username: user.username };
}

export async function destroySessionByToken(token) {
  if (!token) return;
  const db = await readDb();
  db.sessions = db.sessions.filter((session) => session.token !== token);
  await writeDb(db);
}

export async function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const db = await readDb();
  await pruneExpiredSessions(db);
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  return { id: user.id, username: user.username, token };
}

export async function requireAuth(req, _res, next) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      throw new HttpError(401, "Authentication required.");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

