import type { Context, Next } from "hono";
import type { AppEnv } from "../types";
import { hashPassword } from "../utils/crypto";
import { nowIso } from "../utils/http";

/**
 * 在本地开发环境中创建默认管理员账号。
 */
export async function ensureDevelopmentAdmin(c: Context<AppEnv>, next: Next) {
  if (c.env.APP_ENV !== "local" || !c.env.DEFAULT_ADMIN_ACCOUNT || !c.env.DEFAULT_ADMIN_PASSWORD) {
    await next();
    return;
  }

  const account = c.env.DEFAULT_ADMIN_ACCOUNT.trim().toLocaleLowerCase();
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE account = ?").bind(account).first();

  if (!existing) {
    const now = nowIso();
    const id = crypto.randomUUID();
    const password = await hashPassword(c.env.DEFAULT_ADMIN_PASSWORD);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users
         (id, account, password_hash, password_salt, password_algorithm, password_iterations, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, account, password.hash, password.salt, password.algorithm, password.iterations, now, now),
      c.env.DB.prepare(
        `INSERT INTO user_preferences (user_id, theme, density, default_view, created_at, updated_at)
         VALUES (?, 'system', 'comfortable', 'all', ?, ?)`
      ).bind(id, now, now)
    ]);
  }

  await next();
}
