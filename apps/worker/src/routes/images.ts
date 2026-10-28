import type { UploadImageResponse } from "@flowmemo/shared";
import { MEMO_IMAGE_MAX_SIZE } from "@flowmemo/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { readAuthentication, requireAuth } from "../middleware/auth";
import { getEffectivePlan } from "../services/users";
import type { AppEnv, DbUser } from "../types";
import { jsonError } from "../utils/http";

const imageContentTypes = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/gif", "gif"], ["image/webp", "webp"], ["image/avif", "avif"]
]);
export const imageRoutes = new Hono<AppEnv>();
imageRoutes.use("/api/uploads/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Origin, Cookie, Authorization");
  await next();
});
/**
 * 生成 R2 图片对象 key。
 */
function createImageKey(userId: string, contentType: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const extension = imageContentTypes.get(contentType) ?? "bin";
  return `uploads/${userId}/${date}/${crypto.randomUUID()}.${extension}`;
}

/**
 * 图片始终经过 Worker 鉴权代理，避免通过公开 R2/CDN 绕过权限。
 */
function createImageUrl(c: Context<AppEnv>, key: string): string {
  return new URL(`/api/uploads/${key}`, c.req.url).toString();
}
/**
 * 读取图片对象 key，避免空路径和明显非法路径。
 */
function readUploadKey(c: Context<AppEnv>): string | null {
  const prefix = "/api/uploads/";
  let key: string;
  try {
    key = decodeURIComponent(c.req.path.slice(prefix.length));
  } catch {
    return null;
  }
  if (!key || key.includes("..") || key.startsWith("/")) {
    return null;
  }
  return key;
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
       WHERE memos.user_id = ? AND instr(memos.content, ?) > 0
       LIMIT 1`
    )
    .bind(ownerId, key)
    .first();

  return Boolean(row);
}

imageRoutes.post("/api/uploads/images", requireAuth, async (c) => {
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
      cacheControl: "private, no-store"
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

imageRoutes.get("/api/uploads/*", async (c) => {
  const key = readUploadKey(c);
  if (!key) {
    return jsonError(c, "图片不存在", 404);
  }

  const image = await c.env.IMAGES.get(key);
  if (!image) {
    return jsonError(c, "图片不存在", 404);
  }

  const ownerId = readImageOwnerId(key, image.customMetadata);
  const identity = await readAuthentication(c, true);
  let canAccess = Boolean(ownerId && (await isImageReferencedByPublishedMemo(c.env.DB, ownerId, key)));
  if (!canAccess && ownerId && identity?.user.id === ownerId) {
    if (identity.tokenScope.scope === "all") {
      canAccess = true;
    } else if (identity.tokenScope.tags.length > 0) {
      const tags = identity.tokenScope.tags;
      const readableMemo = await c.env.DB.prepare(
        `SELECT 1 FROM memos
         JOIN memo_tags ON memo_tags.memo_id = memos.id
         JOIN tags ON tags.id = memo_tags.tag_id
         WHERE memos.user_id = ? AND tags.user_id = ?
           AND instr(memos.content, ?) > 0
           AND tags.normalized_name IN (${tags.map(() => "?").join(",")})
         LIMIT 1`
      ).bind(ownerId, ownerId, key, ...tags).first();
      canAccess = Boolean(readableMemo);
    }
  }

  if (!canAccess) {
    return jsonError(c, "图片不存在", 404);
  }

  const headers = new Headers();
  image.writeHttpMetadata(headers);
  headers.set("ETag", image.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Origin, Cookie, Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  // 保留 Hono 中间件设置的 CORS 响应头，支持外站带 Token 读取图片。
  return c.body(image.body, { status: 200, headers });
});
