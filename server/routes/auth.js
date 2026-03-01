import { Router } from "express";
import {
  clearSessionCookie,
  createSessionForUser,
  destroySessionByToken,
  getUserFromRequest,
  HttpError,
  loginUser,
  registerUser,
  setSessionCookie
} from "../auth.js";

const router = Router();

router.get("/me", async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    return res.json({
      authenticated: true,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = await registerUser(username, password);
    const token = await createSessionForUser(user.id);
    setSessionCookie(res, token);
    return res.status(201).json({ user });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") {
      throw new HttpError(400, "Username and password are required.");
    }
    const user = await loginUser(username, password);
    const token = await createSessionForUser(user.id);
    setSessionCookie(res, token);
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (user?.token) {
      await destroySessionByToken(user.token);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;

