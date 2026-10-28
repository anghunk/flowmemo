import type { AdminInviteCode } from "@flowmemo/shared";
import type { AppEnv, DbInviteCode } from "../types";
import { nowIso } from "../utils/http";

const INVITE_REGISTRATION_ENABLED_KEY = "invite_registration_enabled";
const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * 生成六位数字或大写英文字母邀请码。
 */
export function createInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const chunks = Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length] ?? "A");
  return chunks.join("");
}

/**
 * 序列化邀请码给管理员后台。
 */
export function serializeInviteCode(code: DbInviteCode): AdminInviteCode {
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
export async function readInviteRegistrationEnabled(db: AppEnv["Bindings"]["DB"]): Promise<boolean> {
  const row = await db
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .bind(INVITE_REGISTRATION_ENABLED_KEY)
    .first<{ value: string; }>();

  return row?.value === "true";
}

/**
 * 写入邀请码模式开关。
 */
export async function updateInviteRegistrationEnabled(db: AppEnv["Bindings"]["DB"], enabled: boolean): Promise<void> {
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
