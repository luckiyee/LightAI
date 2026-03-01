import { Router } from "express";
import { checkOllamaHealth, getOllamaBaseUrl } from "../ollamaClient.js";

const router = Router();

router.get("/", async (_req, res) => {
  const ollamaReachable = await checkOllamaHealth();
  res.json({
    proxy: true,
    ollamaReachable,
    ollamaBaseUrl: getOllamaBaseUrl()
  });
});

export default router;
