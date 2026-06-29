import type { Context } from "hono";
import type { AppEnv } from "../types";
import { createToken, sha256 } from "../utils/crypto";
import { nowIso, sessionTtlSeconds, writeSessionCookie } from "../utils/http";

type SessionPayload = {
  userId: string;
  account: string;
  createdAt: string;
};

/**
 * 创建 session 并写入 Cookie。
 */
export async function createSession(c: Context<AppEnv>, user: { id: string; account: string }) {
  const token = createToken();
  const tokenHash = await sha256(token);
  const payload: SessionPayload = {
    userId: user.id,
    account: user.account,
    createdAt: nowIso()
  };

  await c.env.SESSIONS.put(`session:${tokenHash}`, JSON.stringify(payload), {
    expirationTtl: sessionTtlSeconds()
  });
  writeSessionCookie(c, token);
  return token;
}

/**
 * 读取 session。
 */
export async function readSession(c: Context<AppEnv>, token: string): Promise<SessionPayload | null> {
  const tokenHash = await sha256(token);
  return c.env.SESSIONS.get<SessionPayload>(`session:${tokenHash}`, "json");
}

/**
 * 删除 session。
 */
export async function deleteSession(c: Context<AppEnv>, token: string) {
  const tokenHash = await sha256(token);
  await c.env.SESSIONS.delete(`session:${tokenHash}`);
}
