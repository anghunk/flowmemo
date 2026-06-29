import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AuthResponse,
  DeleteArchivedMemosResponse,
  Memo,
  MemoListQuery,
  MemoListResponse,
  PublishedMemo,
  PublishedMemoListResponse,
  Tag
} from "@flowmemo/shared";

const SESSION_TOKEN_KEY = "flowmemo_session_token";
const DEFAULT_API_BASE_URL = "http://localhost:8787";
const DEFAULT_WEB_BASE_URL = "http://localhost:5173";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL;

export class ApiError extends Error {
  status: number;

  /**
   * 创建统一 API 错误。
   */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 保存移动端 session token。
 */
export async function saveSessionToken(token: string | undefined) {
  if (!token) {
    return;
  }
  await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
}

/**
 * 清理移动端 session token。
 */
export async function clearSessionToken() {
  await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}

/**
 * 读取移动端 session token。
 */
async function readSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_TOKEN_KEY);
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
 * 统一发起 JSON API 请求，并把 Bearer token 附加到移动端请求。
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const sessionToken = await readSessionToken();
  const response = await fetch(buildUrl(path, query), {
    ...options,
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

export const api = {
  register(account: string, password: string, inviteCode: string) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ account, password, inviteCode })
    });
  },

  login(account: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ account, password })
    });
  },

  logout() {
    return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },

  me() {
    return request<AuthResponse>("/api/auth/me");
  },

  updateProfile(nickname: string) {
    return request<AuthResponse>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname })
    });
  },

  changePassword(oldPassword: string, newPassword: string) {
    return request<{ ok: true }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  listMemos(query: MemoListQuery) {
    return request<MemoListResponse>("/api/memos", {}, query as Record<string, string | number | undefined>);
  },

  createMemo(content: string) {
    return request<{ memo: Memo }>("/api/memos", {
      method: "POST",
      body: JSON.stringify({ content })
    });
  },

  randomMemo() {
    return request<{ memo: Memo }>("/api/memos/random");
  },

  updateMemo(id: string, payload: { content?: string; pinned?: boolean; archived?: boolean }) {
    return request<{ memo: Memo }>(`/api/memos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },

  deleteMemo(id: string) {
    return request<{ ok: true }>(`/api/memos/${id}`, { method: "DELETE" });
  },

  clearArchivedMemos() {
    return request<DeleteArchivedMemosResponse>("/api/memos/archive", { method: "DELETE" });
  },

  listTags() {
    return request<{ tags: Tag[] }>("/api/tags");
  },

  listPublishedMemos() {
    return request<PublishedMemoListResponse>("/api/memos/published");
  },

  publishMemo(id: string) {
    return request<{ published: PublishedMemo }>(`/api/memos/${id}/public`, { method: "POST" });
  },

  unpublishMemo(id: string) {
    return request<{ ok: true }>(`/api/memos/${id}/public`, { method: "DELETE" });
  }
};
