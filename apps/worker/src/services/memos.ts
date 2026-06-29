import type { CalendarDayStat, Memo, OverviewStatsResponse, PublishedMemo, PublicMemo, Tag } from "@flowmemo/shared";
import type { AppEnv, DbMemo, DbPublicMemo, DbTag } from "../types";
import { extractTags, normalizeTag } from "../utils/tags";
import { nowIso } from "../utils/http";

type Db = AppEnv["Bindings"]["DB"];

/**
 * 将数据库标签行转换成 API 标签对象。
 */
function mapTag(row: DbTag): Tag {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    icon: row.icon ?? null,
    memoCount: Number(row.memo_count ?? 0)
  };
}

/**
 * 将数据库 memo 行转换成 API memo 对象。
 */
function mapMemo(row: DbMemo, tags: Tag[]): Memo {
  return {
    id: row.id,
    content: row.content,
    pinned: Boolean(row.pinned),
    publicId: row.public_id ?? null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags
  };
}

/**
 * 生成 10 位数字公开 ID，最终唯一性由数据库约束保证。
 */
function generatePublicId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const value = bytes.reduce((sum, byte) => (sum * 256 + byte) % 10000000000, 0);
  return String(value).padStart(10, "0");
}

/**
 * 将公开记录和 memo 行组合成列表响应项。
 */
function mapPublishedMemo(row: DbMemo & DbPublicMemo, tags: Tag[]): PublishedMemo {
  return {
    publicId: row.public_id,
    publishedAt: row.published_at ?? row.created_at,
    memo: mapMemo(row, tags)
  };
}

/**
 * 查询 memo 关联标签。
 */
export async function getTagsForMemos(db: Db, memoIds: string[]): Promise<Map<string, Tag[]>> {
  const result = new Map<string, Tag[]>();
  if (memoIds.length === 0) {
    return result;
  }

  const placeholders = memoIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT memo_tags.memo_id, tags.*, 0 as memo_count
       FROM memo_tags
       JOIN tags ON tags.id = memo_tags.tag_id
       WHERE memo_tags.memo_id IN (${placeholders})
       ORDER BY tags.name ASC`
    )
    .bind(...memoIds)
    .all<DbTag & { memo_id: string }>();

  for (const row of rows.results ?? []) {
    const tags = result.get(row.memo_id) ?? [];
    tags.push(mapTag(row));
    result.set(row.memo_id, tags);
  }

  return result;
}

/**
 * 同步 memo 内容中的标签关系。
 */
export async function syncMemoTags(db: Db, userId: string, memoId: string, content: string): Promise<void> {
  const now = nowIso();
  const tagNames = extractTags(content);

  await db.prepare("DELETE FROM memo_tags WHERE memo_id = ?").bind(memoId).run();

  for (const name of tagNames) {
    const normalizedName = normalizeTag(name);
    const existing = await db
      .prepare("SELECT * FROM tags WHERE user_id = ? AND normalized_name = ?")
      .bind(userId, normalizedName)
      .first<DbTag>();

    const tagId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO tags (id, user_id, name, normalized_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(tagId, userId, name, normalizedName, now, now)
        .run();
    }

    await db
      .prepare("INSERT OR IGNORE INTO memo_tags (memo_id, tag_id, created_at) VALUES (?, ?, ?)")
      .bind(memoId, tagId, now)
      .run();
  }
}

/**
 * 查询 memo 列表，支持视图、标签、关键词和日期筛选。
 */
export async function listMemos(
  db: Db,
  userId: string,
  params: {
    view?: string;
    tag?: string;
    q?: string;
    date?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<{ memos: Memo[]; nextCursor: string | null }> {
  const where = ["memos.user_id = ?"];
  const binds: unknown[] = [userId];
  const limit = Math.min(Math.max(Number(params.limit ?? 30), 1), 50);

  if (params.view === "archive") {
    where.push("memos.archived_at IS NOT NULL");
  } else {
    where.push("memos.archived_at IS NULL");
  }

  if (params.view === "pinned") {
    where.push("memos.pinned = 1");
  }

  if (params.q) {
    where.push("memos.content LIKE ?");
    binds.push(`%${params.q}%`);
  }

  if (params.date) {
    where.push("date(memos.created_at) = date(?)");
    binds.push(params.date);
  }

  if (params.cursor) {
    where.push("memos.created_at < ?");
    binds.push(params.cursor);
  }

  let join = "";
  if (params.tag) {
    join = "JOIN memo_tags ON memo_tags.memo_id = memos.id JOIN tags ON tags.id = memo_tags.tag_id";
    where.push("tags.normalized_name = ?");
    binds.push(normalizeTag(params.tag));
  }

  const rows = await db
    .prepare(
      `SELECT memos.*, public_memos.public_id
       FROM memos
       LEFT JOIN public_memos ON public_memos.memo_id = memos.id
       ${join}
       WHERE ${where.join(" AND ")}
       ORDER BY memos.pinned DESC, memos.created_at DESC
       LIMIT ?`
    )
    .bind(...binds, limit + 1)
    .all<DbMemo>();

  const results = rows.results ?? [];
  const page = results.slice(0, limit);
  const tagMap = await getTagsForMemos(
    db,
    page.map((memo) => memo.id)
  );

  return {
    memos: page.map((memo) => mapMemo(memo, tagMap.get(memo.id) ?? [])),
    nextCursor: results.length > limit ? page.at(-1)?.created_at ?? null : null
  };
}

/**
 * 查询单条 memo。
 */
export async function getMemo(db: Db, userId: string, memoId: string): Promise<Memo | null> {
  const row = await db
    .prepare(
      `SELECT memos.*, public_memos.public_id
       FROM memos
       LEFT JOIN public_memos ON public_memos.memo_id = memos.id
       WHERE memos.id = ? AND memos.user_id = ?`
    )
    .bind(memoId, userId)
    .first<DbMemo>();
  if (!row) {
    return null;
  }

  const tagMap = await getTagsForMemos(db, [row.id]);
  return mapMemo(row, tagMap.get(row.id) ?? []);
}

/**
 * 创建 memo。
 */
export async function createMemo(db: Db, userId: string, content: string): Promise<Memo> {
  const now = nowIso();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO memos (id, user_id, content, pinned, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, 0, NULL, ?, ?)`
    )
    .bind(id, userId, content, now, now)
    .run();
  await syncMemoTags(db, userId, id, content);
  const memo = await getMemo(db, userId, id);
  if (!memo) {
    throw new Error("创建 memo 失败");
  }
  return memo;
}

/**
 * 更新 memo 内容、置顶状态或归档状态。
 */
export async function updateMemo(
  db: Db,
  userId: string,
  memoId: string,
  updates: { content?: string; pinned?: boolean; archived?: boolean }
): Promise<Memo | null> {
  const existing = await getMemo(db, userId, memoId);
  if (!existing) {
    return null;
  }

  const now = nowIso();
  const content = updates.content ?? existing.content;
  const pinned = typeof updates.pinned === "boolean" ? updates.pinned : existing.pinned;
  let archivedAt = existing.archivedAt;
  if (typeof updates.archived === "boolean") {
    archivedAt = updates.archived ? existing.archivedAt ?? now : null;
  }

  await db
    .prepare("UPDATE memos SET content = ?, pinned = ?, archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(content, pinned ? 1 : 0, archivedAt, now, memoId, userId)
    .run();

  if (typeof updates.content === "string") {
    await syncMemoTags(db, userId, memoId, content);
  }

  return getMemo(db, userId, memoId);
}

/**
 * 从数据库永久删除 memo。
 */
export async function permanentlyDeleteMemo(db: Db, userId: string, memoId: string): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM memos WHERE id = ? AND user_id = ? AND archived_at IS NOT NULL")
    .bind(memoId, userId)
    .run();
  return Boolean(result.meta.changes);
}

/**
 * 随机取一条未归档 memo。
 */
export async function getRandomMemo(db: Db, userId: string): Promise<Memo | null> {
  const row = await db
    .prepare(
      `SELECT memos.*, public_memos.public_id
       FROM memos
       LEFT JOIN public_memos ON public_memos.memo_id = memos.id
       WHERE memos.user_id = ? AND memos.archived_at IS NULL
       ORDER BY random()
       LIMIT 1`
    )
    .bind(userId)
    .first<DbMemo>();

  if (!row) {
    return null;
  }

  const tagMap = await getTagsForMemos(db, [row.id]);
  return mapMemo(row, tagMap.get(row.id) ?? []);
}

/**
 * 查询当前用户标签列表。
 */
export async function listTags(db: Db, userId: string): Promise<Tag[]> {
  const rows = await db
    .prepare(
      `SELECT tags.*, COUNT(memo_tags.memo_id) as memo_count
       FROM tags
       JOIN memo_tags ON memo_tags.tag_id = tags.id
       JOIN memos ON memos.id = memo_tags.memo_id
       WHERE tags.user_id = ? AND memos.archived_at IS NULL
       GROUP BY tags.id
       HAVING memo_count > 0
       ORDER BY memo_count DESC, tags.name ASC`
    )
    .bind(userId)
    .all<DbTag>();

  return (rows.results ?? []).map(mapTag);
}

/**
 * 更新当前用户的标签图标。
 */
export async function updateTagIcon(db: Db, userId: string, tagId: string, icon: string | null): Promise<Tag | null> {
  const now = nowIso();
  const row = await db
    .prepare(
      `UPDATE tags
       SET icon = ?, updated_at = ?
       WHERE id = ? AND user_id = ?
       RETURNING *, 0 as memo_count`
    )
    .bind(icon, now, tagId, userId)
    .first<DbTag>();

  if (!row) {
    return null;
  }

  const countRow = await db
    .prepare(
      `SELECT COUNT(memo_tags.memo_id) as memo_count
       FROM memo_tags
       JOIN memos ON memos.id = memo_tags.memo_id
       WHERE memo_tags.tag_id = ? AND memos.archived_at IS NULL`
    )
    .bind(tagId)
    .first<{ memo_count: number }>();

  return mapTag({ ...row, memo_count: countRow?.memo_count ?? 0 });
}

/**
 * 查询日历热力图统计。
 */
export async function getCalendarStats(
  db: Db,
  userId: string,
  from: string,
  to: string,
  utcOffsetMinutes = 0
): Promise<CalendarDayStat[]> {
  const timezoneModifier = `${utcOffsetMinutes >= 0 ? "+" : ""}${utcOffsetMinutes} minutes`;
  const rows = await db
    .prepare(
      `SELECT date(created_at, ?) as date, COUNT(*) as count
       FROM memos
       WHERE user_id = ?
         AND archived_at IS NULL
         AND created_at >= ?
         AND created_at < ?
       GROUP BY date(created_at, ?)
       ORDER BY date ASC`
    )
    .bind(timezoneModifier, userId, from, to, timezoneModifier)
    .all<CalendarDayStat>();

  return rows.results ?? [];
}

/**
 * 为当前用户的一条 memo 创建或读取公开链接。
 */
export async function publishMemo(db: Db, userId: string, memoId: string): Promise<PublishedMemo | null> {
  const memo = await getMemo(db, userId, memoId);
  if (!memo || memo.archivedAt) {
    return null;
  }

  const existing = await db
    .prepare("SELECT * FROM public_memos WHERE memo_id = ? AND user_id = ?")
    .bind(memoId, userId)
    .first<DbPublicMemo>();

  if (existing) {
    return {
      publicId: existing.public_id,
      publishedAt: existing.created_at,
      memo: { ...memo, publicId: existing.public_id }
    };
  }

  const now = nowIso();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const publicId = generatePublicId();
    try {
      await db
        .prepare("INSERT INTO public_memos (public_id, memo_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(publicId, memoId, userId, now)
        .run();
      return {
        publicId,
        publishedAt: now,
        memo: { ...memo, publicId }
      };
    } catch (error) {
      if (attempt === 11) {
        throw error;
      }
    }
  }

  return null;
}

/**
 * 取消当前用户的一条 memo 公开发布。
 */
export async function unpublishMemo(db: Db, userId: string, memoId: string): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM public_memos WHERE memo_id = ? AND user_id = ?")
    .bind(memoId, userId)
    .run();
  return Boolean(result.meta.changes);
}

/**
 * 从数据库永久删除当前用户的所有归档 memo。
 */
export async function permanentlyDeleteArchivedMemos(db: Db, userId: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM memos WHERE user_id = ? AND archived_at IS NOT NULL")
    .bind(userId)
    .run();
  return result.meta.changes ?? 0;
}

/**
 * 查询当前用户已经公开的 memo 列表。
 */
export async function listPublishedMemos(db: Db, userId: string): Promise<PublishedMemo[]> {
  const rows = await db
    .prepare(
      `SELECT memos.*, public_memos.public_id, public_memos.created_at as published_at
       FROM public_memos
       JOIN memos ON memos.id = public_memos.memo_id
       WHERE public_memos.user_id = ?
       ORDER BY public_memos.created_at DESC`
    )
    .bind(userId)
    .all<DbMemo & DbPublicMemo>();

  const results = rows.results ?? [];
  const tagMap = await getTagsForMemos(
    db,
    results.map((memo) => memo.id)
  );

  return results.map((memo) => mapPublishedMemo(memo, tagMap.get(memo.id) ?? []));
}

/**
 * 通过公开 ID 查询任何人可访问的 memo。
 */
export async function getPublicMemo(db: Db, publicId: string): Promise<PublicMemo | null> {
  const row = await db
    .prepare(
      `SELECT memos.*, public_memos.public_id, public_memos.created_at as published_at, users.account, users.nickname
       FROM public_memos
       JOIN memos ON memos.id = public_memos.memo_id
       JOIN users ON users.id = public_memos.user_id
       WHERE public_memos.public_id = ?`
    )
    .bind(publicId)
    .first<DbMemo & DbPublicMemo & { account: string; nickname: string | null }>();

  if (!row) {
    return null;
  }

  const tagMap = await getTagsForMemos(db, [row.id]);
  return {
    ...mapPublishedMemo(row, tagMap.get(row.id) ?? []),
    authorName: row.nickname || row.account
  };
}

/**
 * 查询当前用户的侧边栏概览统计。
 */
export async function getOverviewStats(db: Db, userId: string): Promise<OverviewStatsResponse> {
  const memoRow = await db
    .prepare(
      `SELECT
         COUNT(*) as total_memos,
         COUNT(DISTINCT date(created_at)) as active_days
       FROM memos
       WHERE user_id = ? AND archived_at IS NULL`
    )
    .bind(userId)
    .first<{ total_memos: number; active_days: number }>();

  const tagRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT tags.id) as total_tags
       FROM tags
       JOIN memo_tags ON memo_tags.tag_id = tags.id
       JOIN memos ON memos.id = memo_tags.memo_id
       WHERE tags.user_id = ? AND memos.archived_at IS NULL`
    )
    .bind(userId)
    .first<{ total_tags: number }>();

  return {
    totalMemos: Number(memoRow?.total_memos ?? 0),
    totalTags: Number(tagRow?.total_tags ?? 0),
    activeDays: Number(memoRow?.active_days ?? 0)
  };
}
