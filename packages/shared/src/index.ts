export const MEMO_MAX_LENGTH = 5000;

export const MEMO_IMAGE_MAX_COUNT = 9;

export const MEMO_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

export const REGISTER_ACCOUNT_MAX_LENGTH = 254;

export const REGISTER_INVITE_CODE_LENGTH = 6;

export const REGISTER_ACCOUNT_BLOCKED_WORDS = [
  "admin",
  "administrator",
  "root",
  "system",
  "official",
  "flowmemo",
  "support",
  "staff",
  "moderator"
] as const;

const REGISTER_EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

const REGISTER_INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const MEMO_MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 统计 memo Markdown 内容中引用的图片数量。
 */
export function countMemoImages(content: string): number {
  return Array.from(content.matchAll(MEMO_MARKDOWN_IMAGE_PATTERN)).length;
}

/**
 * 标准化注册邮箱，避免大小写和前后空格造成重复账号。
 */
export function normalizeRegisterAccount(account: unknown): string {
  return typeof account === "string" ? account.trim().toLocaleLowerCase() : "";
}

/**
 * 查找注册邮箱名称部分包含的保留敏感词。
 */
export function findBlockedRegisterAccountWord(account: string): string | null {
  const localPart = account.split("@")[0] ?? account;
  return REGISTER_ACCOUNT_BLOCKED_WORDS.find((word) => localPart.includes(word)) ?? null;
}

/**
 * 校验注册账号必须是邮箱，且名称部分不能包含保留敏感词。
 */
export function validateRegisterAccount(account: unknown): string | null {
  const normalized = normalizeRegisterAccount(account);
  if (!normalized) {
    return "请输入邮箱";
  }
  if (normalized.length > REGISTER_ACCOUNT_MAX_LENGTH) {
    return `邮箱不能超过 ${REGISTER_ACCOUNT_MAX_LENGTH} 个字符`;
  }
  if (!REGISTER_EMAIL_PATTERN.test(normalized)) {
    return "请输入正确的邮箱格式";
  }

  const blockedWord = findBlockedRegisterAccountWord(normalized);
  if (blockedWord) {
    return `邮箱名称不能包含敏感词：${blockedWord}`;
  }

  return null;
}

/**
 * 标准化邀请码，避免大小写和前后空格造成误判。
 */
export function normalizeRegisterInviteCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toLocaleUpperCase() : "";
}

/**
 * 校验注册邀请码格式，仅在服务端开启邀请码模式时强制要求填写。
 */
export function validateRegisterInviteCode(code: unknown, required = false): string | null {
  const normalized = normalizeRegisterInviteCode(code);
  if (!normalized) {
    return required ? "请输入邀请码" : null;
  }
  if (!REGISTER_INVITE_CODE_PATTERN.test(normalized)) {
    return `邀请码必须是 ${REGISTER_INVITE_CODE_LENGTH} 位数字或大写英文`;
  }
  return null;
}

export type UserRole = "user" | "admin";

export type UserPlan = "free" | "member";

export type AiMode = "custom" | "hosted";

export type ThemePreference = "system" | "light" | "dark";

export type DensityPreference = "comfortable" | "compact";

export type User = {
  id: string;
  account: string;
  nickname: string | null;
  role: UserRole;
  plan: UserPlan;
  membershipExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Memo = {
  id: string;
  content: string;
  pinned: boolean;
  publicId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
};

export type PublishedMemo = {
  publicId: string;
  publishedAt: string;
  memo: Memo;
};

export type PublicMemo = PublishedMemo & {
  authorName: string;
};

export type Tag = {
  id: string;
  name: string;
  normalizedName: string;
  icon: string | null;
  memoCount: number;
};

export type CalendarDayStat = {
  date: string;
  count: number;
};

export type UserPreferences = {
  theme: ThemePreference;
  density: DensityPreference;
  defaultView: "all" | "pinned" | "archive";
};

export type MemoListQuery = {
  view?: "all" | "pinned" | "archive";
  tag?: string;
  q?: string;
  date?: string;
  cursor?: string;
  limit?: number;
};

export type MemoListResponse = {
  memos: Memo[];
  nextCursor: string | null;
};

export type DeleteArchivedMemosResponse = {
  ok: true;
  deleted: number;
};

export type UploadedImage = {
  key: string;
  url: string;
};

export type UploadImageResponse = {
  image: UploadedImage;
};

export type PublishedMemoListResponse = {
  memos: PublishedMemo[];
};

export type AuthResponse = {
  user: User;
  sessionToken?: string;
};

export type CalendarStatsResponse = {
  days: CalendarDayStat[];
};

export type OverviewStatsResponse = {
  totalMemos: number;
  totalTags: number;
  activeDays: number;
};

export type AiEntitlementResponse = {
  plan: UserPlan;
  availableModes: AiMode[];
  defaultMode: AiMode;
};

export type AdminUser = {
  id: string;
  account: string;
  nickname: string | null;
  role: UserRole;
  plan: UserPlan;
  membershipExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserListResponse = {
  users: AdminUser[];
  nextCursor: string | null;
};

export type UpdateUserMembershipRequest = {
  plan: UserPlan;
  membershipExpiresAt?: string | null;
};

export type AdminInviteCode = {
  code: string;
  createdByUserId: string;
  usedByUserId: string | null;
  usedAt: string | null;
  createdAt: string;
};

export type AdminInviteRegistrationResponse = {
  registrationEnabled: boolean;
  codes: AdminInviteCode[];
};

export type UpdateInviteRegistrationRequest = {
  registrationEnabled: boolean;
};
