import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { jsonError, readSessionToken } from "../utils/http";
import { readSession } from "../services/session";
import { readApiTokenUser } from "../services/apiTokens";
import type { ApiTokenAuth } from "../services/apiTokens";

/**
 * 从 Authorization header 中读取 Bearer token。
 */
export function readBearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }
  return value.slice("Bearer ".length).trim() || undefined;
}

/**
 * 读取可选身份并保留授权范围，供中间件和图片接口复用。
 */
export async function readAuthentication(c: Context<AppEnv>, allowApiTokens = false): Promise<ApiTokenAuth | null> {
  const bearerToken = readBearerToken(c.req.header("Authorization"));
  const tokens = new Set([readSessionToken(c), bearerToken].filter((token): token is string => Boolean(token)));
  for (const token of tokens) {
    const session = await readSession(c, token);
    if (session) {
      return {
        user: { id: session.userId, account: session.account },
        tokenScope: { scope: "all", tags: [] }
      };
    }
  }

  return allowApiTokens && bearerToken ? readApiTokenUser(c.env.DB, bearerToken) : null;
}

/**
 * 校验会话登录态；个人 API Token 不能访问账户管理和写接口。
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = await readAuthentication(c);
  if (!identity) {
    return jsonError(c, "请先登录或重新登录", 401);
  }
  c.set("user", identity.user);
  await next();
};

/**
 * 验证外部 API 调用身份，允许使用登录态或个人 API Token。
 */
export const requireApiAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = await readAuthentication(c, true);
  if (!identity) {
    return jsonError(c, "API Token 无效或已撤销", 401);
  }
  c.set("user", identity.user);
  c.set("apiTokenScope", identity.tokenScope);
  await next();
};
