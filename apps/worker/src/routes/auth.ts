import { normalizeRegisterAccount, normalizeRegisterInviteCode, validateRegisterAccount, validateRegisterInviteCode } from "@flowmemo/shared";
import { Hono } from "hono";
import { readBearerToken, requireAuth } from "../middleware/auth";
import { readInviteRegistrationEnabled } from "../services/invites";
import { createSession, deleteSession } from "../services/session";
import { serializeUser } from "../services/users";
import type { AppEnv, DbInviteCode, DbUser } from "../types";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { clearSessionCookie, jsonError, nowIso, readSessionToken } from "../utils/http";
import { readJson } from "../utils/validation";
import { loginSchema, passwordSchema, profileSchema, registerSchema } from "../validation/requests";

export const authRoutes = new Hono<AppEnv>();
authRoutes.post("/api/auth/register", async (c) => {
  const body = await readJson(c, registerSchema);
  const account = normalizeRegisterAccount(body?.account);
  const inviteCode = normalizeRegisterInviteCode(body?.inviteCode);
  const inviteRegistrationEnabled = await readInviteRegistrationEnabled(c.env.DB);
  const accountError = validateRegisterAccount(account);
  const inviteCodeError = validateRegisterInviteCode(inviteCode, inviteRegistrationEnabled);

  if (accountError) {
    return jsonError(c, accountError);
  }
  if (inviteCodeError) {
    return jsonError(c, inviteCodeError);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE account = ?").bind(account).first();
  if (existing) {
    return jsonError(c, "账号已存在", 409);
  }

  const now = nowIso();
  const id = crypto.randomUUID();
  const password = await hashPassword(body?.password ?? "");

  try {
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
  } catch (error) {
    throw error;
  }

  if (inviteRegistrationEnabled) {
    const invite = await c.env.DB.prepare(
      `UPDATE invite_codes
       SET used_by_user_id = ?, used_at = ?
       WHERE code = ? AND used_by_user_id IS NULL
       RETURNING *`
    )
      .bind(id, now, inviteCode)
      .first<DbInviteCode>();

    if (!invite) {
      await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      return jsonError(c, "邀请码无效或已被使用", 400);
    }
  }

  const sessionToken = await createSession(c, { id, account });
  return c.json({
    user: {
      id,
      account,
      nickname: null,
      role: "user",
      plan: "free",
      membershipExpiresAt: null,
      createdAt: now,
      updatedAt: now
    },
    sessionToken
  }, 201);
});

authRoutes.post("/api/auth/login", async (c) => {
  const body = await readJson(c, loginSchema);
  const account = normalizeRegisterAccount(body.account);
  const password = body?.password ?? "";

  if (!account || !password) {
    return jsonError(c, "请输入账号和密码", 400);
  }

  const rateKey = `login:${account}:${c.req.header("CF-Connecting-IP") ?? "local"}`;
  const attempts = Number((await c.env.RATE_LIMIT.get(rateKey)) ?? "0");
  if (attempts >= 8) {
    return jsonError(c, "登录尝试过多，请稍后再试", 429);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE account = ?").bind(account).first<DbUser>();
  const valid =
    user &&
    (await verifyPassword({
      password,
      hash: user.password_hash,
      salt: user.password_salt,
      iterations: user.password_iterations
    }));

  if (!user || !valid) {
    await c.env.RATE_LIMIT.put(rateKey, String(attempts + 1), { expirationTtl: 60 * 10 });
    return jsonError(c, "账号或密码错误", 401);
  }

  await c.env.RATE_LIMIT.delete(rateKey);
  const sessionToken = await createSession(c, { id: user.id, account: user.account });
  return c.json({
    user: serializeUser(user, c.env),
    sessionToken
  });
});

authRoutes.post("/api/auth/logout", async (c) => {
  const tokens = new Set([readSessionToken(c), readBearerToken(c.req.header("Authorization"))]);
  for (const token of tokens) {
    if (token) {
      await deleteSession(c, token);
    }
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/api/auth/me", requireAuth, async (c) => {
  const sessionUser = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(sessionUser.id).first<DbUser>();
  if (!user) {
    return jsonError(c, "用户不存在", 404);
  }
  return c.json({ user: serializeUser(user, c.env) });
});

authRoutes.patch("/api/auth/profile", requireAuth, async (c) => {
  const body = await readJson(c, profileSchema);
  const nickname = body.nickname || null;

  const userRef = c.get("user");
  const updatedAt = nowIso();
  const result = await c.env.DB.prepare(
    `UPDATE users
     SET nickname = ?, updated_at = ?
     WHERE id = ?
     RETURNING *`
  )
    .bind(nickname, updatedAt, userRef.id)
    .first<DbUser>();

  if (!result) {
    return jsonError(c, "用户不存在", 404);
  }

  return c.json({ user: serializeUser(result, c.env) });
});

authRoutes.post("/api/auth/change-password", requireAuth, async (c) => {
  const body = await readJson(c, passwordSchema);
  const userRef = c.get("user");

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userRef.id).first<DbUser>();
  if (!user) {
    return jsonError(c, "用户不存在", 404);
  }

  const valid = await verifyPassword({
    password: body?.oldPassword ?? "",
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations
  });
  if (!valid) {
    return jsonError(c, "原密码错误", 401);
  }

  const nextPassword = await hashPassword(body?.newPassword ?? "");
  await c.env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, password_algorithm = ?, password_iterations = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextPassword.hash,
      nextPassword.salt,
      nextPassword.algorithm,
      nextPassword.iterations,
      nowIso(),
      user.id
    )
    .run();

  return c.json({ ok: true });
});
