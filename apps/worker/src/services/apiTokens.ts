import type { ApiToken, CreateApiTokenRequest, CreateApiTokenResponse } from "@flowmemo/shared";
import type { AppEnv, DbApiToken } from "../types";
import { createToken, sha256 } from "../utils/crypto";
import { nowIso } from "../utils/http";
import { normalizeTag } from "../utils/tags";

const API_TOKEN_PREFIX = "fm_";
const TAG_SCOPE_SEPARATOR_PATTERN = /[\s,，、;；]+/u;

type Db = AppEnv["Bindings"]["DB"];
export type ApiTokenScope = {
  scope: "all" | "tags";
  tags: string[];
};
export type ApiTokenAuth = {
  user: {
    id: string;
    account: string;
  };
  tokenScope: ApiTokenScope;
};

/**
 * 解析 API token 允许访问的标签列表。
 */
function parseAllowedTags(value: string): string[] {
  try {
    const tags = JSON.parse(value) as unknown;
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 标准化 API token 可读范围。
 */
export function normalizeApiTokenScope(payload: Pick<CreateApiTokenRequest, "scope" | "tags"> | null | undefined): ApiTokenScope {
  if (payload?.scope !== "tags") {
    return {
      scope: "all",
      tags: []
    };
  }

  const tags = Array.from(
    new Set(
      (payload.tags ?? [])
        .filter((tag): tag is string => typeof tag === "string")
        .flatMap((tag) => tag.split(TAG_SCOPE_SEPARATOR_PATTERN))
        .map((tag) => normalizeTag(tag.replace(/^#+/u, "")))
        .filter(Boolean)
    )
  );

  return {
    scope: "tags",
    tags
  };
}

/**
 * 将数据库 API token 行转换为前端可展示对象。
 */
function mapApiToken(row: DbApiToken): ApiToken {
  const scope = row.scope === "tags" ? "tags" : "all";
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    // 旧版本创建的 token 未保存明文，无法再次展示
    token: row.token_value,
    scope,
    tags: scope === "tags" ? parseAllowedTags(row.allowed_tags_json) : [],
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at
  };
}

/**
 * 标准化 API token 名称。
 */
export function normalizeApiTokenName(name: unknown): string {
  if (typeof name !== "string") {
    return "默认 API Token";
  }

  const normalized = name.trim();
  return normalized || "默认 API Token";
}

/**
 * 生成可展示一次的原始 API token。
 */
function createApiTokenValue(): string {
  return `${API_TOKEN_PREFIX}${createToken(32)}`;
}

/**
 * 生成当前用户 API token，并仅返回一次原始 token。
 */
export async function createApiToken(
  db: Db,
  userId: string,
  name: string,
  tokenScope: ApiTokenScope
): Promise<CreateApiTokenResponse> {
  const now = nowIso();
  const token = createApiTokenValue();
  const tokenHash = await sha256(token);
  const tokenPrefix = token.slice(0, 10);
  const row = await db
    .prepare(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, token_value, scope, allowed_tags_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      name,
      tokenHash,
      tokenPrefix,
      token,
      tokenScope.scope,
      JSON.stringify(tokenScope.tags),
      now
    )
    .first<DbApiToken>();

  if (!row) {
    throw new Error("API token 创建失败");
  }

  return {
    token,
    apiToken: mapApiToken(row)
  };
}

/**
 * 查询当前用户仍可用的 API token。
 */
export async function listApiTokens(db: Db, userId: string): Promise<ApiToken[]> {
  const rows = await db
    .prepare(
      `SELECT *
       FROM api_tokens
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<DbApiToken>();

  return (rows.results ?? []).map(mapApiToken);
}

/**
 * 撤销当前用户的 API token。
 */
export async function revokeApiToken(db: Db, userId: string, tokenId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE api_tokens
       SET revoked_at = ?
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
    )
    .bind(nowIso(), tokenId, userId)
    .run();

  return Boolean(result.meta.changes);
}

/**
 * 通过原始 Bearer token 读取 API token 所属用户。
 */
export async function readApiTokenUser(db: Db, token: string): Promise<ApiTokenAuth | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) {
    return null;
  }

  const tokenHash = await sha256(token);
  const now = nowIso();
  const row = await db
    .prepare(
      `UPDATE api_tokens
       SET last_used_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL
       RETURNING user_id, scope, allowed_tags_json`
    )
    .bind(now, tokenHash)
    .first<{ user_id: string; scope: string; allowed_tags_json: string }>();

  if (!row) {
    return null;
  }

  const user = await db
    .prepare("SELECT id, account FROM users WHERE id = ?")
    .bind(row.user_id)
    .first<{ id: string; account: string }>();

  if (!user) {
    return null;
  }

  const scope = row.scope === "tags" ? "tags" : "all";
  return {
    user,
    tokenScope: {
      scope,
      tags: scope === "tags" ? parseAllowedTags(row.allowed_tags_json) : []
    }
  };
}
