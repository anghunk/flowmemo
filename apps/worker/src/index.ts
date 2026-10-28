import { Hono } from "hono";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { apiTokenRoutes } from "./routes/apiTokens";
import { authRoutes } from "./routes/auth";
import { imageRoutes } from "./routes/images";
import { memoRoutes } from "./routes/memos";
import { ensureDevelopmentAdmin } from "./services/development";
import type { AppEnv } from "./types";
import { corsMiddleware, jsonError } from "./utils/http";
import { ValidationError } from "./utils/validation";

const app = new Hono<AppEnv>();
app.onError((error, c) => {
  if (error instanceof ValidationError) {
    return jsonError(c, error.message);
  }
  console.error("Worker 请求处理失败", error);
  return jsonError(c, "服务暂时不可用，请稍后重试", 500);
});
app.use("*", corsMiddleware);
app.use("*", ensureDevelopmentAdmin);
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/", authRoutes);
app.route("/", adminRoutes);
app.route("/", apiTokenRoutes);
app.route("/", imageRoutes);
app.route("/", memoRoutes);
app.route("/", accountRoutes);

export default app;
