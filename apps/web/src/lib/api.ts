import type {
  AdminUser,
  AdminUserListResponse,
  AdminInviteCode,
  AdminInviteRegistrationResponse,
  AiEntitlementResponse,
  AuthResponse,
  CalendarStatsResponse,
  DeleteArchivedMemosResponse,
  Memo,
  MemoListQuery,
  MemoListResponse,
  OverviewStatsResponse,
  PublishedMemo,
  PublishedMemoListResponse,
  PublicMemo,
  Tag,
  UploadImageResponse,
  UpdateInviteRegistrationRequest,
  UpdateUserMembershipRequest,
  UserPreferences
} from "@flowmemo/shared";

/**
 * 获取未显式配置时的 API 地址。
 */
function getDefaultApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:8787";
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:8787";
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredApiBaseUrl || getDefaultApiBaseUrl();
const SESSION_TOKEN_KEY = "flowmemo_session_token";

/**
 * 判断 API 是否和当前页面同源。
 */
function isSameOriginApi(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return new URL(API_BASE_URL).origin === window.location.origin;
}

/**
 * 存储跨域开发模式下的 session token。
 */
export function saveSessionToken(token: string | undefined) {
  if (!token || isSameOriginApi()) {
    return;
  }
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
}

/**
 * 清理本地 session token。
 */
export function clearSessionToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

/**
 * 读取跨域开发模式下的 session token。
 */
function readSessionToken(): string | null {
  if (typeof window === "undefined" || isSameOriginApi()) {
    return null;
  }
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

/**
 * 判断 URL 是否指向当前 API 的上传图片代理。
 */
export function isApiUploadUrl(value: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const url = new URL(value, window.location.href);
    const apiUrl = new URL(API_BASE_URL);
    return url.origin === apiUrl.origin && url.pathname.startsWith("/api/uploads/");
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;

  /**
   * 创建 API 错误。
   */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 构造带查询参数的 API URL。
 */
function buildUrl(path: string, query?: Record<string, string | number | undefined | null>): string {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * 发起 API 请求，并统一处理错误信息和 Cookie。
 */
async function request<T>(path: string, options: RequestInit = {}, query?: Record<string, string | number | undefined>) {
  const sessionToken = readSessionToken();
  const response = await fetch(buildUrl(path, query), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "请求失败", response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * 发起表单上传类 API 请求。
 */
async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const sessionToken = readSessionToken();
  const response = await fetch(buildUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
    },
    body
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "请求失败", response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * 发起文件下载类 API 请求。
 */
async function requestBlob(
  path: string,
  options: RequestInit = {},
  query?: Record<string, string | number | undefined>
): Promise<Blob> {
  const sessionToken = readSessionToken();
  const response = await fetch(buildUrl(path, query), {
    ...options,
    credentials: "include",
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "请求失败", response.status);
  }

  return response.blob();
}

/**
 * 带当前登录态读取受保护图片。
 */
export async function fetchProtectedImage(src: string): Promise<Blob> {
  const sessionToken = readSessionToken();
  const response = await fetch(src, {
    credentials: "include",
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "图片加载失败", response.status);
  }

  return response.blob();
}

export const api = {
  /**
   * 注册账号。
   */
  register(account: string, password: string, inviteCode: string) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ account, password, inviteCode })
    });
  },

  /**
   * 登录账号。
   */
  login(account: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ account, password })
    });
  },

  /**
   * 退出登录。
   */
  logout() {
    return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },

  /**
   * 获取当前用户。
   */
  me() {
    return request<AuthResponse>("/api/auth/me");
  },

  /**
   * 修改密码。
   */
  changePassword(oldPassword: string, newPassword: string) {
    return request<{ ok: true }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  /**
   * 更新当前用户资料。
   */
  updateProfile(nickname: string) {
    return request<AuthResponse>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname })
    });
  },

  /**
   * 查询 memo 列表。
   */
  aiEntitlement() {
    return request<AiEntitlementResponse>("/api/ai/entitlement");
  },

  listAdminUsers(query: { q?: string; cursor?: string; limit?: number }) {
    return request<AdminUserListResponse>("/api/admin/users", {}, query);
  },

  updateUserMembership(id: string, payload: UpdateUserMembershipRequest) {
    return request<{ user: AdminUser }>(`/api/admin/users/${id}/membership`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },

  listAdminInvites() {
    return request<AdminInviteRegistrationResponse>("/api/admin/invites");
  },

  createAdminInvite() {
    return request<{ code: AdminInviteCode }>("/api/admin/invites", { method: "POST" });
  },

  updateInviteRegistration(payload: UpdateInviteRegistrationRequest) {
    return request<{ registrationEnabled: boolean }>("/api/admin/invites/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },

  listMemos(query: MemoListQuery) {
    return request<MemoListResponse>("/api/memos", {}, query as Record<string, string | number | undefined>);
  },

  /**
   * 创建 memo。
   */
  createMemo(content: string) {
    return request<{ memo: Memo }>("/api/memos", {
      method: "POST",
      body: JSON.stringify({ content })
    });
  },

  /**
   * 随机取一条 memo。
   */
  randomMemo() {
    return request<{ memo: Memo }>("/api/memos/random");
  },

  /**
   * 上传 memo 图片。
   */
  uploadImage(file: File) {
    const body = new FormData();
    body.append("image", file);
    return requestForm<UploadImageResponse>("/api/uploads/images", body);
  },

  /**
   * 查询当前用户已公开的 memo。
   */
  listPublishedMemos() {
    return request<PublishedMemoListResponse>("/api/memos/published");
  },

  /**
   * 为 memo 生成公开链接。
   */
  publishMemo(id: string) {
    return request<{ published: PublishedMemo }>(`/api/memos/${id}/public`, { method: "POST" });
  },

  /**
   * 取消 memo 公开链接。
   */
  unpublishMemo(id: string) {
    return request<{ ok: true }>(`/api/memos/${id}/public`, { method: "DELETE" });
  },

  /**
   * 查询公开访问的 memo。
   */
  publicMemo(publicId: string) {
    return request<{ published: PublicMemo }>(`/api/explore/${publicId}`);
  },

  /**
   * 更新 memo。
   */
  updateMemo(id: string, payload: { content?: string; pinned?: boolean; archived?: boolean }) {
    return request<{ memo: Memo }>(`/api/memos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },

  /**
   * 永久删除 memo。
   */
  deleteMemo(id: string) {
    return request<{ ok: true }>(`/api/memos/${id}`, { method: "DELETE" });
  },

  /**
   * 清空当前用户的归档 memo。
   */
  clearArchivedMemos() {
    return request<DeleteArchivedMemosResponse>("/api/memos/archive", { method: "DELETE" });
  },

  /**
   * 查询标签。
   */
  listTags() {
    return request<{ tags: Tag[] }>("/api/tags");
  },

  /**
   * 更新标签图标。
   */
  updateTagIcon(id: string, icon: string | null) {
    return request<{ tag: Tag }>(`/api/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ icon })
    });
  },

  /**
   * 查询日历统计。
   */
  calendarStats(from: string, to: string, utcOffsetMinutes: number) {
    return request<CalendarStatsResponse>("/api/stats/calendar", {}, {
      from,
      to,
      utcOffsetMinutes: String(utcOffsetMinutes)
    });
  },

  /**
   * 查询侧边栏概览统计。
   */
  overviewStats() {
    return request<OverviewStatsResponse>("/api/stats/overview");
  },

  /**
   * 查询偏好。
   */
  preferences() {
    return request<{ preferences: UserPreferences }>("/api/preferences");
  },

  /**
   * 导出 memo 文件。
   */
  exportMemos(format: "markdown" | "json" = "markdown") {
    return requestBlob("/api/export", {}, { format });
  }
};
