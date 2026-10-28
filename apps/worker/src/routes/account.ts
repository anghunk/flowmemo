import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { getCalendarStats, getOverviewStats, listTags, updateTagIcon } from "../services/memos";
import { getAiEntitlement } from "../services/users";
import type { AppEnv, DbUser } from "../types";
import { jsonError, nowIso } from "../utils/http";
import { readJson, ValidationError } from "../utils/validation";
import { preferencesSchema, readCalendarQuery, tagSchema } from "../validation/requests";

export const accountRoutes = new Hono<AppEnv>();
accountRoutes.get("/api/ai/entitlement", requireAuth, async (c) => {
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(c.get("user").id).first<DbUser>();
  if (!user) {
    return jsonError(c, "用户不存在", 404);
  }

  return c.json(getAiEntitlement(user));
});
accountRoutes.get("/api/tags", requireAuth, async (c) => {
  const tags = await listTags(c.env.DB, c.get("user").id);
  return c.json({ tags });
});

accountRoutes.patch("/api/tags/:id", requireAuth, async (c) => {
  const { icon } = await readJson(c, tagSchema);

  const tag = await updateTagIcon(c.env.DB, c.get("user").id, c.req.param("id"), icon);
  if (!tag) {
    return jsonError(c, "标签不存在", 404);
  }
  return c.json({ tag });
});

accountRoutes.get("/api/stats/calendar", requireAuth, async (c) => {
  const { from, to, utcOffsetMinutes } = readCalendarQuery(c);
  const days = await getCalendarStats(c.env.DB, c.get("user").id, from, to, utcOffsetMinutes);
  return c.json({ days });
});

accountRoutes.get("/api/stats/overview", requireAuth, async (c) => {
  const stats = await getOverviewStats(c.env.DB, c.get("user").id);
  return c.json(stats);
});

accountRoutes.get("/api/preferences", requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .bind(c.get("user").id)
    .first<{ theme: string; density: string; default_view: string; }>();

  return c.json({
    preferences: {
      theme: row?.theme ?? "system",
      density: row?.density ?? "comfortable",
      defaultView: row?.default_view ?? "all"
    }
  });
});

accountRoutes.patch("/api/preferences", requireAuth, async (c) => {
  const body = await readJson(c, preferencesSchema);
  if (body.theme === undefined && body.density === undefined && body.defaultView === undefined) {
    throw new ValidationError("请提供要更新的偏好设置");
  }
  const now = nowIso();
  const row = await c.env.DB.prepare(
    `INSERT INTO user_preferences (user_id, theme, density, default_view, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       theme = COALESCE(?, user_preferences.theme),
       density = COALESCE(?, user_preferences.density),
       default_view = COALESCE(?, user_preferences.default_view),
       updated_at = excluded.updated_at
     RETURNING theme, density, default_view`
  )
    .bind(c.get("user").id, body.theme ?? "system", body.density ?? "comfortable", body.defaultView ?? "all", now, now,
      body.theme ?? null, body.density ?? null, body.defaultView ?? null)
    .first<{ theme: string; density: string; default_view: string }>();

  if (!row) {
    return jsonError(c, "保存偏好设置失败", 500);
  }
  return c.json({ preferences: { theme: row.theme, density: row.density, defaultView: row.default_view } });
});
