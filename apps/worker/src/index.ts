import {
  countMemoImages,
  MEMO_IMAGE_MAX_COUNT,
  MEMO_IMAGE_MAX_SIZE,
  MEMO_MAX_LENGTH,
  normalizeRegisterAccount,
  normalizeRegisterInviteCode,
  validateRegisterAccount,
  validateRegisterInviteCode
} from "@flowmemo/shared";
import type {
  AdminInviteCode,
  AdminInviteRegistrationResponse,
  AdminUser,
  AdminUserListResponse,
  AiEntitlementResponse,
  Memo,
  UploadImageResponse,
  UpdateInviteRegistrationRequest,
  UpdateUserMembershipRequest,
  UserPlan,
  UserRole
} from "@flowmemo/shared";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import type { AppEnv, DbInviteCode, DbUser } from "./types";
import { requireAuth } from "./middleware/auth";
import { ensureDevelopmentAdmin } from "./services/development";
import { createSession, deleteSession, readSession } from "./services/session";
import {
  createMemo,
  getCalendarStats,
  getOverviewStats,
  getPublicMemo,
  getRandomMemo,
  listPublishedMemos,
  listMemos,
  listTags,
  permanentlyDeleteArchivedMemos,
  permanentlyDeleteMemo,
  publishMemo,
  unpublishMemo,
  updateTagIcon,
  updateMemo
} from "./services/memos";
import { hashPassword, verifyPassword } from "./utils/crypto";
import { clearSessionCookie, corsMiddleware, jsonError, nowIso, readSessionToken } from "./utils/http";

const app = new Hono<AppEnv>();
const INVITE_REGISTRATION_ENABLED_KEY = "invite_registration_enabled";
const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const imageContentTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

app.use("*", corsMiddleware);
app.use("*", ensureDevelopmentAdmin);

/**
 * 解析 JSON 请求体。
 */
async function readJson<T>(c: Context<AppEnv>): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

/**
 * 标准化账号，避免前后空格和大小写造成重复账号。
 */
function normalizeAccount(account: unknown): string {
  return typeof account === "string" ? account.trim().toLocaleLowerCase() : "";
}

/**
 * 校验密码强度。
 */
function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") {
    return "请输入密码";
  }
  if (password.length < 8) {
    return "密码至少需要 8 位";
  }
  if (password.length > 128) {
    return "密码不能超过 128 位";
  }
  return null;
}

/**
 * 校验并清理昵称，空字符串会重置为未设置。
 */
function normalizeNickname(nickname: string | undefined): string | null | undefined {
  if (nickname === undefined) {
    return undefined;
  }
  const normalized = nickname.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * 检查昵称是否合法。
 */
function validateNickname(nickname: string | null | undefined): string | null {
  if (nickname === undefined || nickname === null) {
    return null;
  }
  if (nickname.length > 32) {
    return "昵称不能超过 32 个字符";
  }
  return null;
}

/**
 * 校验单条 memo 内引用的图片数量。
 */
function validateMemoImageCount(content: string): string | null {
  if (countMemoImages(content) > MEMO_IMAGE_MAX_COUNT) {
    return `同一条笔记最多支持 ${MEMO_IMAGE_MAX_COUNT} 张图片`;
  }
  return null;
}

const TAG_ICON_MAX_LENGTH = 32;

/**
 * 判断字符串是否包含 emoji 图标特征。
 */
function hasEmojiIcon(value: string): boolean {
  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(value) || /^[0-9#*]\uFE0F?\u20E3$/u.test(value);
}

/**
 * 校验并标准化标签图标。
 */
function normalizeTagIcon(icon: unknown): string | null | undefined {
  if (icon === null) {
    return null;
  }
  if (icon === undefined) {
    return undefined;
  }
  if (typeof icon !== "string") {
    return undefined;
  }
  const normalized = icon.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > TAG_ICON_MAX_LENGTH || /[\u0000-\u001F\u007F-\u009F\s]/u.test(normalized) || !hasEmojiIcon(normalized)) {
    return undefined;
  }
  return normalized;
}

/**
 * 标准化热力图本地时区偏移，单位为分钟。
 */
function normalizeUtcOffsetMinutes(value: string | undefined): number {
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    return 0;
  }
  return offset;
}

/**
 * 生成 R2 图片对象 key。
 */
function createImageKey(userId: string, contentType: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const extension = imageContentTypes.get(contentType) ?? "bin";
  return `uploads/${userId}/${date}/${crypto.randomUUID()}.${extension}`;
}

/**
 * 生成当前 Worker 下的图片公开访问地址。
 */
function createImageUrl(c: Context<AppEnv>, key: string): string {
  const publicImageBaseUrl = c.env.PUBLIC_IMAGE_BASE_URL?.trim();
  if (publicImageBaseUrl) {
    const normalizedBaseUrl = publicImageBaseUrl.includes("://")
      ? publicImageBaseUrl
      : `https://${publicImageBaseUrl}`;
    const baseUrl = normalizedBaseUrl.endsWith("/") ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
    return new URL(key, baseUrl).toString();
  }

  return new URL(`/api/uploads/${key}`, c.req.url).toString();
}

/**
 * 生成短邀请码，去掉容易混淆的字符。
 */
function createInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const chunks = Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length] ?? "A");
  return chunks.join("");
}

/**
 * 序列化邀请码给管理员后台。
 */
function serializeInviteCode(code: DbInviteCode): AdminInviteCode {
  return {
    code: code.code,
    createdByUserId: code.created_by_user_id,
    usedByUserId: code.used_by_user_id,
    usedAt: code.used_at,
    createdAt: code.created_at
  };
}

/**
 * 读取邀请码模式开关，缺省为开放注册。
 */
async function readInviteRegistrationEnabled(db: AppEnv["Bindings"]["DB"]): Promise<boolean> {
  const row = await db
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .bind(INVITE_REGISTRATION_ENABLED_KEY)
    .first<{ value: string }>();

  return row?.value === "true";
}

/**
 * 写入邀请码模式开关。
 */
async function updateInviteRegistrationEnabled(db: AppEnv["Bindings"]["DB"], enabled: boolean): Promise<void> {
  const now = nowIso();
  await db.prepare(
    `INSERT INTO system_settings (key, value, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  )
    .bind(INVITE_REGISTRATION_ENABLED_KEY, enabled ? "true" : "false", now, now)
    .run();
}

/**
 * 读取图片对象 key，避免空路径和明显非法路径。
 */
function readUploadKey(c: Context<AppEnv>): string | null {
  const prefix = "/api/uploads/";
  const key = decodeURIComponent(c.req.path.slice(prefix.length));
  if (!key || key.includes("..") || key.startsWith("/")) {
    return null;
  }
  return key;
}

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
 * 尝试读取当前登录用户，未登录时返回 null。
 */
async function readOptionalUser(c: Context<AppEnv>): Promise<{ id: string; account: string } | null> {
  const token = readSessionToken(c) ?? readBearerToken(c.req.header("Authorization"));
  if (!token) {
    return null;
  }

  const session = await readSession(c, token);
  if (!session) {
    return null;
  }

  return {
    id: session.userId,
    account: session.account
  };
}

/**
 * 从上传路径中兜底解析所属用户 ID。
 */
function readImageOwnerId(key: string, metadata: Record<string, string> | undefined): string | null {
  if (metadata?.userId) {
    return metadata.userId;
  }

  const match = /^uploads\/([^/]+)\//.exec(key);
  return match?.[1] ?? null;
}

/**
 * 判断图片是否被上传者的公开 memo 正文引用。
 */
async function isImageReferencedByPublishedMemo(
  db: AppEnv["Bindings"]["DB"],
  ownerId: string,
  key: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1
       FROM public_memos
       JOIN memos ON memos.id = public_memos.memo_id
       WHERE memos.user_id = ? AND memos.content LIKE ?
       LIMIT 1`
    )
    .bind(ownerId, `%${key}%`)
    .first();

  return Boolean(row);
}

/**
 * 序列化用户资料给前端。
 */
function isEnvAdminUserId(env: AppEnv["Bindings"], userId: string): boolean {
  const allowlist = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean);

  return allowlist.includes(userId.trim().toLocaleLowerCase());
}

function normalizeRole(role: string | undefined, userId: string, env: AppEnv["Bindings"]): UserRole {
  if (role === "admin" || isEnvAdminUserId(env, userId)) {
    return "admin";
  }
  return "user";
}

function getEffectivePlan(plan: string | undefined, expiresAt: string | null | undefined): UserPlan {
  if (plan !== "member") {
    return "free";
  }
  if (!expiresAt) {
    return "member";
  }
  return new Date(expiresAt).getTime() > Date.now() ? "member" : "free";
}

function serializeAdminUser(user: DbUser, env: AppEnv["Bindings"]): AdminUser {
  return {
    id: user.id,
    account: user.account,
    nickname: user.nickname,
    role: normalizeRole(user.role, user.id, env),
    plan: user.plan === "member" ? "member" : "free",
    membershipExpiresAt: user.membership_expires_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function serializeUser(user: DbUser, env: AppEnv["Bindings"]) {
  return {
    id: user.id,
    account: user.account,
    nickname: user.nickname,
    role: normalizeRole(user.role, user.id, env),
    plan: getEffectivePlan(user.plan, user.membership_expires_at),
    membershipExpiresAt: user.membership_expires_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const sessionUser = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(sessionUser.id).first<DbUser>();
  if (!user || normalizeRole(user.role, user.id, c.env) !== "admin") {
    return jsonError(c, "没有管理员权限", 403);
  }
  await next();
}

function getAiEntitlement(user: DbUser): AiEntitlementResponse {
  const plan = getEffectivePlan(user.plan, user.membership_expires_at);
  if (plan === "member") {
    return {
      plan,
      availableModes: ["hosted", "custom"],
      defaultMode: "hosted"
    };
  }

  return {
    plan,
    availableModes: ["custom"],
    defaultMode: "custom"
  };
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/register", async (c) => {
  const body = await readJson<{ account?: string; password?: string; inviteCode?: string }>(c);
  const account = normalizeRegisterAccount(body?.account);
  const inviteCode = normalizeRegisterInviteCode(body?.inviteCode);
  const inviteRegistrationEnabled = await readInviteRegistrationEnabled(c.env.DB);
  const accountError = validateRegisterAccount(account);
  const inviteCodeError = validateRegisterInviteCode(inviteCode, inviteRegistrationEnabled);
  const passwordError = validatePassword(body?.password);

  if (accountError) {
    return jsonError(c, accountError);
  }
  if (inviteCodeError) {
    return jsonError(c, inviteCodeError);
  }
  if (passwordError) {
    return jsonError(c, passwordError);
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

app.post("/api/auth/login", async (c) => {
  const body = await readJson<{ account?: string; password?: string }>(c);
  const account = normalizeAccount(body?.account);
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

app.post("/api/auth/logout", async (c) => {
  const token = readSessionToken(c);
  if (token) {
    await deleteSession(c, token);
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (c) => {
  const sessionUser = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(sessionUser.id).first<DbUser>();
  if (!user) {
    return jsonError(c, "用户不存在", 404);
  }
  return c.json({ user: serializeUser(user, c.env) });
});

app.patch("/api/auth/profile", requireAuth, async (c) => {
  const body = await readJson<{ nickname?: string }>(c);
  if (body?.nickname !== undefined && typeof body.nickname !== "string") {
    return jsonError(c, "昵称格式不正确");
  }
  const nickname = normalizeNickname(body?.nickname);
  const nicknameError = validateNickname(nickname);
  if (nicknameError) {
    return jsonError(c, nicknameError);
  }
  if (nickname === undefined) {
    return jsonError(c, "请输入昵称");
  }

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

app.post("/api/auth/change-password", requireAuth, async (c) => {
  const body = await readJson<{ oldPassword?: string; newPassword?: string }>(c);
  const userRef = c.get("user");
  const passwordError = validatePassword(body?.newPassword);
  if (passwordError) {
    return jsonError(c, passwordError);
  }

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

app.get("/api/ai/entitlement", requireAuth, async (c) => {
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(c.get("user").id).first<DbUser>();
  if (!user) {
    return jsonError(c, "用户不存在", 404);
  }

  return c.json(getAiEntitlement(user));
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (c) => {
  const q = c.req.query("q")?.trim();
  const cursor = c.req.query("cursor");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 30), 1), 50);
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

app.patch("/api/admin/users/:id/membership", requireAuth, requireAdmin, async (c) => {
  const body = await readJson<UpdateUserMembershipRequest>(c);
  const targetUserId = c.req.param("id");
  const plan = body?.plan;
  const expiresAt = body?.membershipExpiresAt ?? null;

  if (plan !== "free" && plan !== "member") {
    return jsonError(c, "会员状态无效", 400);
  }

  if (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime())) {
    return jsonError(c, "会员到期时间无效", 400);
  }

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

app.get("/api/admin/invites", requireAuth, requireAdmin, async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
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

app.patch("/api/admin/invites/settings", requireAuth, requireAdmin, async (c) => {
  const body = await readJson<UpdateInviteRegistrationRequest>(c);
  if (typeof body?.registrationEnabled !== "boolean") {
    return jsonError(c, "邀请码模式开关无效", 400);
  }

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

app.post("/api/admin/invites", requireAuth, requireAdmin, async (c) => {
  const adminUserId = c.get("user").id;
  const now = nowIso();
  let created: DbInviteCode | null = null;

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
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

app.get("/api/memos", requireAuth, async (c) => {
  const user = c.get("user");
  const memos = await listMemos(c.env.DB, user.id, {
    view: c.req.query("view"),
    tag: c.req.query("tag"),
    q: c.req.query("q"),
    date: c.req.query("date"),
    cursor: c.req.query("cursor"),
    limit: Number(c.req.query("limit") ?? 30)
  });
  return c.json(memos);
});

app.post("/api/memos", requireAuth, async (c) => {
  const body = await readJson<{ content?: string }>(c);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return jsonError(c, "内容不能为空");
  }
  if (content.length > MEMO_MAX_LENGTH) {
    return jsonError(c, `内容不能超过 ${MEMO_MAX_LENGTH} 字`);
  }
  const imageCountError = validateMemoImageCount(content);
  if (imageCountError) {
    return jsonError(c, imageCountError);
  }

  const memo = await createMemo(c.env.DB, c.get("user").id, content);
  return c.json({ memo }, 201);
});

app.get("/api/memos/random", requireAuth, async (c) => {
  const memo = await getRandomMemo(c.env.DB, c.get("user").id);
  if (!memo) {
    return jsonError(c, "还没有可以漫游的 memo", 404);
  }
  return c.json({ memo });
});

app.get("/api/memos/published", requireAuth, async (c) => {
  const memos = await listPublishedMemos(c.env.DB, c.get("user").id);
  return c.json({ memos });
});

app.post("/api/uploads/images", requireAuth, async (c) => {
  const sessionUser = c.get("user");
  const dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(sessionUser.id).first<DbUser>();
  if (!dbUser) {
    return jsonError(c, "用户不存在", 404);
  }
  if (getEffectivePlan(dbUser.plan, dbUser.membership_expires_at) !== "member") {
    return jsonError(c, "图片上传仅 PRO 会员可用", 403);
  }

  const formData = await c.req.raw.formData().catch(() => null);
  const image = formData?.get("image");

  if (!(image instanceof File)) {
    return jsonError(c, "请选择要上传的图片");
  }

  if (!imageContentTypes.has(image.type)) {
    return jsonError(c, "仅支持 JPG、PNG、GIF、WebP、AVIF 图片");
  }

  if (image.size <= 0 || image.size > MEMO_IMAGE_MAX_SIZE) {
    return jsonError(c, "图片大小不能超过 5MB");
  }

  const key = createImageKey(sessionUser.id, image.type);
  await c.env.IMAGES.put(key, image.stream(), {
    httpMetadata: {
      contentType: image.type,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      userId: sessionUser.id,
      fileName: image.name.slice(0, 120)
    }
  });

  const response: UploadImageResponse = {
    image: {
      key,
      url: createImageUrl(c, key)
    }
  };
  return c.json(response, 201);
});

app.get("/api/uploads/*", async (c) => {
  const key = readUploadKey(c);
  if (!key) {
    return jsonError(c, "图片不存在", 404);
  }

  const image = await c.env.IMAGES.get(key);
  if (!image) {
    return jsonError(c, "图片不存在", 404);
  }

  const ownerId = readImageOwnerId(key, image.customMetadata);
  const user = await readOptionalUser(c);
  const canAccess =
    Boolean(ownerId && user?.id === ownerId) ||
    Boolean(ownerId && (await isImageReferencedByPublishedMemo(c.env.DB, ownerId, key)));

  if (!canAccess) {
    return jsonError(c, "图片不存在", 404);
  }

  const headers = new Headers();
  image.writeHttpMetadata(headers);
  headers.set("ETag", image.httpEtag);
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(image.body, { status: 200, headers });
});

app.post("/api/memos/:id/public", requireAuth, async (c) => {
  const published = await publishMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!published) {
    return jsonError(c, "memo 不存在或已经归档", 404);
  }
  return c.json({ published });
});

app.delete("/api/memos/:id/public", requireAuth, async (c) => {
  await unpublishMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/explore/:publicId", async (c) => {
  const publicId = c.req.param("publicId");
  if (!/^\d{10}$/.test(publicId)) {
    return jsonError(c, "公开链接无效", 404);
  }

  const published = await getPublicMemo(c.env.DB, publicId);
  if (!published) {
    return jsonError(c, "公开笔记不存在", 404);
  }

  return c.json({ published });
});

app.patch("/api/memos/:id", requireAuth, async (c) => {
  const body = await readJson<{ content?: string; pinned?: boolean; archived?: boolean }>(c);
  if (!body) {
    return jsonError(c, "请求体无效");
  }
  const content = typeof body.content === "string" ? body.content.trim() : undefined;
  if (content !== undefined) {
    if (content.length === 0) {
      return jsonError(c, "内容不能为空");
    }
    if (content.length > MEMO_MAX_LENGTH) {
      return jsonError(c, `内容不能超过 ${MEMO_MAX_LENGTH} 字`);
    }
    const imageCountError = validateMemoImageCount(content);
    if (imageCountError) {
      return jsonError(c, imageCountError);
    }
  }

  const memo = await updateMemo(c.env.DB, c.get("user").id, c.req.param("id"), {
    content,
    pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    archived: typeof body.archived === "boolean" ? body.archived : undefined
  });

  if (!memo) {
    return jsonError(c, "memo 不存在", 404);
  }

  return c.json({ memo });
});

app.delete("/api/memos/archive", requireAuth, async (c) => {
  const deleted = await permanentlyDeleteArchivedMemos(c.env.DB, c.get("user").id);
  return c.json({ ok: true, deleted });
});

app.delete("/api/memos/:id", requireAuth, async (c) => {
  const memo = await permanentlyDeleteMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!memo) {
    return jsonError(c, "memo 不存在或尚未归档", 404);
  }
  return c.json({ ok: true });
});

app.get("/api/tags", requireAuth, async (c) => {
  const tags = await listTags(c.env.DB, c.get("user").id);
  return c.json({ tags });
});

app.patch("/api/tags/:id", requireAuth, async (c) => {
  const body = await readJson<{ icon?: string | null }>(c);
  const icon = normalizeTagIcon(body?.icon);
  if (icon === undefined) {
    return jsonError(c, "标签图标无效");
  }

  const tag = await updateTagIcon(c.env.DB, c.get("user").id, c.req.param("id"), icon);
  if (!tag) {
    return jsonError(c, "标签不存在", 404);
  }

  return c.json({ tag });
});

app.get("/api/stats/calendar", requireAuth, async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) {
    return jsonError(c, "缺少日期范围");
  }

  const utcOffsetMinutes = normalizeUtcOffsetMinutes(c.req.query("utcOffsetMinutes"));
  const days = await getCalendarStats(c.env.DB, c.get("user").id, from, to, utcOffsetMinutes);
  return c.json({ days });
});

app.get("/api/stats/overview", requireAuth, async (c) => {
  const stats = await getOverviewStats(c.env.DB, c.get("user").id);
  return c.json(stats);
});

app.get("/api/preferences", requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .bind(c.get("user").id)
    .first<{ theme: string; density: string; default_view: string }>();

  return c.json({
    preferences: {
      theme: row?.theme ?? "system",
      density: row?.density ?? "comfortable",
      defaultView: row?.default_view ?? "all"
    }
  });
});

app.patch("/api/preferences", requireAuth, async (c) => {
  const body = await readJson<{ theme?: string; density?: string; defaultView?: string }>(c);
  const theme = ["system", "light", "dark"].includes(body?.theme ?? "") ? body?.theme : "system";
  const density = ["comfortable", "compact"].includes(body?.density ?? "") ? body?.density : "comfortable";
  const defaultView = ["all", "pinned", "archive"].includes(body?.defaultView ?? "") ? body?.defaultView : "all";
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO user_preferences (user_id, theme, density, default_view, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       theme = excluded.theme,
       density = excluded.density,
       default_view = excluded.default_view,
       updated_at = excluded.updated_at`
  )
    .bind(c.get("user").id, theme, density, defaultView, now, now)
    .run();

  return c.json({ preferences: { theme, density, defaultView } });
});

app.get("/api/export", requireAuth, async (c) => {
  const format = c.req.query("format") ?? "json";
  const memos: Memo[] = [];
  let cursor: string | undefined;

  do {
    const page = await listMemos(c.env.DB, c.get("user").id, { view: "all", limit: 50, cursor });
    memos.push(...page.memos);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  if (format === "markdown") {
    const markdown = memos
      .map((memo) => `## ${memo.createdAt}\n\n${memo.content}\n`)
      .join("\n");
    return c.text(markdown, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=flowmemo-export.md"
    });
  }

  return c.json({ memos });
});

export default app;
