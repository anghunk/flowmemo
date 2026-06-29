import { getCookie, setCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import type { AppEnv } from "../types";

export const SESSION_COOKIE = "flowmemo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * 返回当前时间的 ISO 字符串。
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 构建 JSON 错误响应。
 */
export function jsonError(c: Context<AppEnv>, message: string, status = 400) {
  return c.json({ error: message }, status as 400);
}

/**
 * 解析允许跨域访问 API 的前端来源列表。
 */
function parseAllowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

/**
 * 配置跨域响应头，允许前端携带 HttpOnly Cookie 请求 API。
 */
export async function corsMiddleware(c: Context<AppEnv>, next: Next) {
  const origin = c.req.header("Origin");
  const allowedOrigins = parseAllowedOrigins(c.env.WEB_ORIGIN);

  if (origin && allowedOrigins.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  }

  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
}

/**
 * 读取当前请求中的 session token。
 */
export function readSessionToken(c: Context<AppEnv>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/**
 * 写入登录态 Cookie。
 */
export function writeSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "local",
    sameSite: c.env.APP_ENV === "local" ? "Lax" : "None",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    domain: c.env.COOKIE_DOMAIN || undefined
  });
}

/**
 * 清理登录态 Cookie。
 */
export function clearSessionCookie(c: Context<AppEnv>) {
  setCookie(c, SESSION_COOKIE, "", {
    httpOnly: true,
    secure: c.env.APP_ENV !== "local",
    sameSite: c.env.APP_ENV === "local" ? "Lax" : "None",
    path: "/",
    maxAge: 0,
    domain: c.env.COOKIE_DOMAIN || undefined
  });
}

/**
 * 获取 session 的 KV 过期秒数。
 */
export function sessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}
