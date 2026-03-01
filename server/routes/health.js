import { Router } from "express";
import { getRuntimeHealth } from "../lightRuntime.js";

const router = Router();

router.get("/", async (_req, res) => {
  const runtime = await getRuntimeHealth();
  res.json({
    proxy: true,
    runtimeProvider: runtime.provider,
    runtimeReachable: runtime.reachable
  });
});

export default router;
