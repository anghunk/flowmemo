import type { Context, Next } from "hono";
import { normalizeRole } from "../services/users";
import type { AppEnv, DbUser } from "../types";
import { jsonError } from "../utils/http";
/** 重新读取数据库角色，拒绝非管理员访问后台。 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const sessionUser = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(sessionUser.id).first<DbUser>();
  if (!user || normalizeRole(user.role, user.id, c.env) !== "admin") {
    return jsonError(c, "没有管理员权限", 403);
  }
  await next();
}
