import type { ApiTokenListResponse, CreateApiTokenResponse } from "@flowmemo/shared";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { createApiToken, listApiTokens, normalizeApiTokenName, normalizeApiTokenScope, revokeApiToken } from "../services/apiTokens";
import type { AppEnv } from "../types";
import { jsonError } from "../utils/http";
import { readJson, ValidationError } from "../utils/validation";
import { apiTokenSchema } from "../validation/requests";

export const apiTokenRoutes = new Hono<AppEnv>();
apiTokenRoutes.get("/api/api-tokens", requireAuth, async (c) => {
  const response: ApiTokenListResponse = {
    tokens: await listApiTokens(c.env.DB, c.get("user").id)
  };
  return c.json(response);
});

apiTokenRoutes.post("/api/api-tokens", requireAuth, async (c) => {
  const body = await readJson(c, apiTokenSchema);
  const name = normalizeApiTokenName(body?.name);
  const tokenScope = normalizeApiTokenScope(body);
  if (tokenScope.tags.length > 50) {
    throw new ValidationError("可读标签不能超过 50 个");
  }
  if (tokenScope.scope === "tags" && tokenScope.tags.length === 0) {
    return jsonError(c, "请选择至少一个可读标签");
  }

  const response: CreateApiTokenResponse = await createApiToken(c.env.DB, c.get("user").id, name, tokenScope);
  return c.json(response, 201);
});

apiTokenRoutes.delete("/api/api-tokens/:id", requireAuth, async (c) => {
  const revoked = await revokeApiToken(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!revoked) {
    return jsonError(c, "API Token 不存在", 404);
  }
  return c.json({ ok: true });
});
