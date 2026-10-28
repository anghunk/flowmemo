import type { Memo } from "@flowmemo/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { requireApiAuth, requireAuth } from "../middleware/auth";
import { createMemo, getPublicMemo, getRandomMemo, listMemos, listPublishedMemos, permanentlyDeleteArchivedMemos, permanentlyDeleteMemo, publishMemo, unpublishMemo, updateMemo } from "../services/memos";
import type { AppEnv } from "../types";
import { jsonError } from "../utils/http";
import { enumField, readJson, ValidationError } from "../utils/validation";
import { createMemoSchema, readMemoListQuery, updateMemoSchema } from "../validation/requests";

export const memoRoutes = new Hono<AppEnv>();
/**
 * 查询当前用户 memo，供前端和外部 API 调用复用。
 */
async function handleListMemos(c: Context<AppEnv>) {
  const user = c.get("user");
  const tokenScope = c.get("apiTokenScope");
  const memos = await listMemos(
    c.env.DB,
    user.id,
    readMemoListQuery(c),
    tokenScope?.scope === "tags"
      ? {
        restrictToReadableTags: true,
        readableTags: tokenScope.tags
      }
      : undefined
  );
  return c.json(memos);
}

memoRoutes.get("/api/memos", requireAuth, handleListMemos);

memoRoutes.get("/api/v1/memos", requireApiAuth, handleListMemos);

memoRoutes.post("/api/memos", requireAuth, async (c) => {
  const { content } = await readJson(c, createMemoSchema);

  const memo = await createMemo(c.env.DB, c.get("user").id, content);
  return c.json({ memo }, 201);
});

memoRoutes.get("/api/memos/random", requireAuth, async (c) => {
  const memo = await getRandomMemo(c.env.DB, c.get("user").id);
  if (!memo) {
    return jsonError(c, "还没有可以漫游的 memo", 404);
  }
  return c.json({ memo });
});

memoRoutes.get("/api/memos/published", requireAuth, async (c) => {
  const memos = await listPublishedMemos(c.env.DB, c.get("user").id);
  return c.json({ memos });
});
memoRoutes.post("/api/memos/:id/public", requireAuth, async (c) => {
  const published = await publishMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!published) {
    return jsonError(c, "memo 不存在或已经归档", 404);
  }
  return c.json({ published });
});

memoRoutes.delete("/api/memos/:id/public", requireAuth, async (c) => {
  await unpublishMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

memoRoutes.get("/api/explore/:publicId", async (c) => {
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

memoRoutes.patch("/api/memos/:id", requireAuth, async (c) => {
  const body = await readJson(c, updateMemoSchema);
  if (body.content === undefined && body.pinned === undefined && body.archived === undefined) {
    throw new ValidationError("请提供内容、置顶状态或归档状态");
  }
  const memo = await updateMemo(c.env.DB, c.get("user").id, c.req.param("id"), body);

  if (!memo) {
    return jsonError(c, "memo 不存在", 404);
  }
  return c.json({ memo });
});

memoRoutes.delete("/api/memos/archive", requireAuth, async (c) => {
  const deleted = await permanentlyDeleteArchivedMemos(c.env.DB, c.get("user").id);
  return c.json({ ok: true, deleted });
});

memoRoutes.delete("/api/memos/:id", requireAuth, async (c) => {
  const memo = await permanentlyDeleteMemo(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!memo) {
    return jsonError(c, "memo 不存在或尚未归档", 404);
  }
  return c.json({ ok: true });
});
memoRoutes.get("/api/export", requireAuth, async (c) => {
  const format = enumField("导出格式", ["json", "markdown"])(c.req.query("format") ?? "json");
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
