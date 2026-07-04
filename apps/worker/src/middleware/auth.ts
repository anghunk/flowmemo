import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { jsonError, readSessionToken } from "../utils/http";
import { readSession } from "../services/session";
import { readApiTokenUser } from "../services/apiTokens";

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
  const sessionToken = readSessionToken(c);
  const bearerToken = readBearerToken(c.req.header("Authorization"));
  if (!sessionToken && !bearerToken) {
    return jsonError(c, "请先登录", 401);
  }

  if (sessionToken) {
    const session = await readSession(c, sessionToken);
    if (session) {
      c.set("user", {
        id: session.userId,
        account: session.account
      });
      await next();
      return;
    }
  }

  if (bearerToken) {
    const session = await readSession(c, bearerToken);
    if (session) {
      c.set("user", {
        id: session.userId,
        account: session.account
      });
      await next();
      return;
    }
  }

  return jsonError(c, "登录态已过期", 401);
};

/**
 * 验证外部 API 调用身份，允许使用登录态或个人 API Token。
 */
export const requireApiAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionToken = readSessionToken(c);
  const bearerToken = readBearerToken(c.req.header("Authorization"));

  if (sessionToken) {
    const session = await readSession(c, sessionToken);
    if (session) {
      c.set("user", {
        id: session.userId,
        account: session.account
      });
      await next();
      return;
    }
  }

  if (bearerToken) {
    const session = await readSession(c, bearerToken);
    if (session) {
      c.set("user", {
        id: session.userId,
        account: session.account
      });
      await next();
      return;
    }

    const apiUser = await readApiTokenUser(c.env.DB, bearerToken);
    if (apiUser) {
      c.set("user", apiUser.user);
      c.set("apiTokenScope", apiUser.tokenScope);
      await next();
      return;
    }
  }

  return jsonError(c, "API Token 无效或已撤销", 401);
};
