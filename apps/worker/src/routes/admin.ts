import type { AdminInviteRegistrationResponse, AdminUserListResponse } from "@flowmemo/shared";
import { Hono } from "hono";
import { requireAdmin } from "../middleware/admin";
import { requireAuth } from "../middleware/auth";
import { createInviteCode, readInviteRegistrationEnabled, serializeInviteCode, updateInviteRegistrationEnabled } from "../services/invites";
import { serializeAdminUser } from "../services/users";
import type { AppEnv, DbInviteCode, DbUser } from "../types";
import { jsonError, nowIso } from "../utils/http";
import { readIntegerQuery, readJson } from "../utils/validation";
import { inviteSettingsSchema, membershipSchema, readAdminUserQuery } from "../validation/requests";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.get("/api/admin/users", requireAuth, requireAdmin, async (c) => {
  const { q, cursor, limit } = readAdminUserQuery(c);
  const where: string[] = [];
  const binds: unknown[] = [];

  if (q) {
    where.push("(account LIKE ? OR nickname LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  if (cursor) {
    where.push("created_at < ?");
    binds.push(cursor);
  }

  const rows = await c.env.DB.prepare(
    `SELECT *
     FROM users
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(...binds, limit + 1)
    .all<DbUser>();

  const results = rows.results ?? [];
  const page = results.slice(0, limit);
  const response: AdminUserListResponse = {
    users: page.map((user) => serializeAdminUser(user, c.env)),
    nextCursor: results.length > limit ? page.at(-1)?.created_at ?? null : null
  };

  return c.json(response);
});

adminRoutes.patch("/api/admin/users/:id/membership", requireAuth, requireAdmin, async (c) => {
  const body = await readJson(c, membershipSchema);
  const targetUserId = c.req.param("id");
  const plan = body?.plan;
  const expiresAt = body?.membershipExpiresAt ?? null;

  const before = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first<DbUser>();
  if (!before) {
    return jsonError(c, "用户不存在", 404);
  }

  const now = nowIso();
  const updated = await c.env.DB.prepare(
    `UPDATE users
     SET plan = ?, membership_expires_at = ?, updated_at = ?
     WHERE id = ?
     RETURNING *`
  )
    .bind(plan, plan === "member" ? expiresAt : null, now, targetUserId)
    .first<DbUser>();

  if (!updated) {
    return jsonError(c, "用户不存在", 404);
  }

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs
     (id, admin_user_id, target_user_id, action, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      c.get("user").id,
      targetUserId,
      "update_membership",
      JSON.stringify(serializeAdminUser(before, c.env)),
      JSON.stringify(serializeAdminUser(updated, c.env)),
      now
    )
    .run();

  return c.json({ user: serializeAdminUser(updated, c.env) });
});

adminRoutes.get("/api/admin/invites", requireAuth, requireAdmin, async (c) => {
  const limit = readIntegerQuery(c, "limit", 1, 100) ?? 50;
  const [registrationEnabled, rows] = await Promise.all([
    readInviteRegistrationEnabled(c.env.DB),
    c.env.DB.prepare(
      `SELECT *
       FROM invite_codes
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(limit)
      .all<DbInviteCode>()
  ]);

  const response: AdminInviteRegistrationResponse = {
    registrationEnabled,
    codes: (rows.results ?? []).map(serializeInviteCode)
  };

  return c.json(response);
});

adminRoutes.patch("/api/admin/invites/settings", requireAuth, requireAdmin, async (c) => {
  const body = await readJson(c, inviteSettingsSchema);

  const before = await readInviteRegistrationEnabled(c.env.DB);
  await updateInviteRegistrationEnabled(c.env.DB, body.registrationEnabled);
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs
     (id, admin_user_id, target_user_id, action, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      c.get("user").id,
      c.get("user").id,
      "update_invite_registration",
      JSON.stringify({ registrationEnabled: before }),
      JSON.stringify({ registrationEnabled: body.registrationEnabled }),
      now
    )
    .run();

  return c.json({ registrationEnabled: body.registrationEnabled });
});

adminRoutes.post("/api/admin/invites", requireAuth, requireAdmin, async (c) => {
  const adminUserId = c.get("user").id;
  const now = nowIso();
  let created: DbInviteCode | null = null;

  for (let attempt = 0;attempt < 5 && !created;attempt += 1) {
    const code = createInviteCode();
    created = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO invite_codes (code, created_by_user_id, created_at)
       VALUES (?, ?, ?)
       RETURNING *`
    )
      .bind(code, adminUserId, now)
      .first<DbInviteCode>();
  }

  if (!created) {
    return jsonError(c, "邀请码生成失败，请重试", 500);
  }

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs
     (id, admin_user_id, target_user_id, action, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      adminUserId,
      adminUserId,
      "create_invite_code",
      null,
      JSON.stringify(serializeInviteCode(created)),
      now
    )
    .run();

  return c.json({ code: serializeInviteCode(created) }, 201);
});
