import type { AdminUser, AiEntitlementResponse, UserPlan, UserRole } from "@flowmemo/shared";
import type { AppEnv, DbUser } from "../types";
/** 检查部署配置中的管理员白名单。 */
function isEnvAdminUserId(env: AppEnv["Bindings"], userId: string): boolean {
  const allowlist = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean);

  return allowlist.includes(userId.trim().toLocaleLowerCase());
}

/** 合并数据库角色与部署白名单。 */
export function normalizeRole(role: string | undefined, userId: string, env: AppEnv["Bindings"]): UserRole {
  if (role === "admin" || isEnvAdminUserId(env, userId)) {
    return "admin";
  }
  return "user";
}

/** 按到期时间计算实际会员权益。 */
export function getEffectivePlan(plan: string | undefined, expiresAt: string | null | undefined): UserPlan {
  if (plan !== "member") {
    return "free";
  }
  if (!expiresAt) {
    return "member";
  }
  return new Date(expiresAt).getTime() > Date.now() ? "member" : "free";
}

/** 向管理员返回存储的会员配置。 */
export function serializeAdminUser(user: DbUser, env: AppEnv["Bindings"]): AdminUser {
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

/** 向用户返回当前有效权益。 */
export function serializeUser(user: DbUser, env: AppEnv["Bindings"]) {
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

/** 计算账号可选择的 AI 模式。 */
export function getAiEntitlement(user: DbUser): AiEntitlementResponse {
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
