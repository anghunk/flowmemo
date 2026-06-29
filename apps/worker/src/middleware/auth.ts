import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { jsonError, readSessionToken } from "../utils/http";
import { readSession } from "../services/session";

/**
 * 从 Authorization header 中读取 Bearer token。
 */
function readBearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }
  return value.slice("Bearer ".length).trim() || undefined;
}

/**
 * 校验登录态，并把当前用户写入上下文变量。
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readSessionToken(c) ?? readBearerToken(c.req.header("Authorization"));
  if (!token) {
    return jsonError(c, "请先登录", 401);
  }

  const session = await readSession(c, token);
  if (!session) {
    return jsonError(c, "登录态已过期", 401);
  }

  c.set("user", {
    id: session.userId,
    account: session.account
  });

  await next();
};
