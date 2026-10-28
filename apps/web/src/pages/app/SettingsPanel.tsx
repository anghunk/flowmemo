import {
  Braces,
  Check,
  Copy,
  KeyRound,
  Terminal
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from "../../hooks/useApiTokens";
import { useMe } from "../../hooks/useAuth";
import {
  useTags
} from "../../hooks/useMemos";
import { API_BASE_URL, ApiError } from "../../lib/api";
import { formatDateTime } from "./format";

const API_TOKEN_TAG_SEPARATOR_PATTERN = /[\s,，、;；]+/u;

const API_TOKEN_SCOPE_STORAGE_PREFIX = "flowmemo_api_token_scope";

/**
 * 生成 memo API 调用入口地址。
 */
export function getMemoApiEndpoint(): string {
  return new URL("/api/v1/memos", API_BASE_URL).toString();
}

type ApiTokenScopeDraft = {
  scope: "all" | "tags";
  tags: string[];
};

/**
 * 读取本地保存的 API token 范围草稿。
 */
export function parseStoredApiTokenScope(value: string | null): ApiTokenScopeDraft | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<ApiTokenScopeDraft>;
    if (parsed.scope !== "all" && parsed.scope !== "tags") {
      return null;
    }
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((tagName): tagName is string => typeof tagName === "string")
      : [];
    return {
      scope: parsed.scope,
      tags: parsed.scope === "tags" ? tags : [],
    };
  } catch {
    return null;
  }
}

export function SettingsPanel() {
  const endpoint = getMemoApiEndpoint();
  const currentUser = useMe();
  const tokenQuery = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();
  const apiTokens = tokenQuery.data?.tokens ?? [];
  const apiTokenLoading = tokenQuery.isLoading;
  const apiTokenSubmitting = createToken.isPending || revokeToken.isPending;
  const [apiTokenName, setApiTokenName] = useState("默认 API Token");
  const [apiTokenScope, setApiTokenScope] = useState<"all" | "tags">("all");
  const [apiTokenTagsText, setApiTokenTagsText] = useState("");
  const [savedApiTokenScope, setSavedApiTokenScope] = useState<ApiTokenScopeDraft>({ scope: "all", tags: [] });
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const availableTags = useTags();
  const apiTokenScopeStorageKey = currentUser.data?.user.id
    ? `${API_TOKEN_SCOPE_STORAGE_PREFIX}:${currentUser.data.user.id}`
    : null;
  const curlExample = `curl -H "Authorization: Bearer <API_TOKEN>" "${endpoint}?tags=${encodeURIComponent("工作,灵感")}&page=1&pageSize=20"`;
  const selectedApiTokenTags = useMemo(
    () =>
      Array.from(
        new Set(
          apiTokenTagsText
            .split(API_TOKEN_TAG_SEPARATOR_PATTERN)
            .map((tagName) => tagName.trim().replace(/^#+/u, ""))
            .filter(Boolean),
        ),
      ),
    [apiTokenTagsText],
  );
  const apiTokenScopeDirty =
    savedApiTokenScope.scope !== apiTokenScope ||
    savedApiTokenScope.tags.join("\n") !== (apiTokenScope === "tags" ? selectedApiTokenTags.join("\n") : "");

  async function copyApiText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function generateApiToken() {
    if (apiTokenScopeDirty) {
      toast.error("请先保存可读范围设置");
      return;
    }
    try {
      const data = await createToken.mutateAsync({
        name: apiTokenName,
        scope: savedApiTokenScope.scope,
        tags: savedApiTokenScope.scope === "tags" ? savedApiTokenScope.tags : [],
      });
      setGeneratedToken(data.token);
      toast.success("API Token 已生成");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "API Token 生成失败");
    }
  }

  function saveApiTokenScope() {
    if (apiTokenScope === "tags" && selectedApiTokenTags.length === 0) {
      toast.error("请选择至少一个可读标签");
      return;
    }
    const nextScope: ApiTokenScopeDraft = {
      scope: apiTokenScope,
      tags: apiTokenScope === "tags" ? selectedApiTokenTags : [],
    };
    setSavedApiTokenScope(nextScope);
    if (apiTokenScopeStorageKey) {
      window.localStorage.setItem(apiTokenScopeStorageKey, JSON.stringify(nextScope));
    }
    toast.success("可读范围已保存");
  }

  function toggleApiTokenTag(tagName: string) {
    const next = selectedApiTokenTags.includes(tagName)
      ? selectedApiTokenTags.filter((item) => item !== tagName)
      : [...selectedApiTokenTags, tagName];
    setApiTokenTagsText(next.join("，"));
  }

  async function revokeCurrentApiToken(tokenId: string) {
    try {
      await revokeToken.mutateAsync(tokenId);
      if (apiTokens.find((token) => token.id === tokenId)?.token === generatedToken) {
        setGeneratedToken(null);
      }
      toast.success("API Token 已撤销");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "API Token 撤销失败");
    }
  }


  useEffect(() => {
    if (!apiTokenScopeStorageKey) {
      return;
    }
    const storedScope = parseStoredApiTokenScope(window.localStorage.getItem(apiTokenScopeStorageKey));
    if (!storedScope) {
      return;
    }
    setApiTokenScope(storedScope.scope);
    setApiTokenTagsText(storedScope.tags.join("，"));
    setSavedApiTokenScope(storedScope);
  }, [apiTokenScopeStorageKey]);

  return (
    <section className="settings-panel">
      <section className="settings-section api-settings-section">
        <div className="api-settings-header">
          <div className="api-settings-title-row">
            <span className="api-settings-icon">
              <Braces size={19} />
            </span>
            <div>
              <p className="settings-label">开放能力</p>
              <h2 className="settings-title">API 调用</h2>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="api-copy-button"
            onClick={() => void copyApiText(endpoint, "API 地址已复制")}
          >
            <Copy size={14} />
            复制地址
          </Button>
        </div>

        <div className="api-endpoint-box">
          <span>GET</span>
          <code>{endpoint}</code>
        </div>

        <div className="api-param-grid">
          <div>
            <strong>标签</strong>
            <span>tag / tags</span>
          </div>
          <div>
            <strong>分页</strong>
            <span>cursor 或 page/pageSize</span>
          </div>
          <div>
            <strong>认证</strong>
            <span>Bearer API Token</span>
          </div>
        </div>

        <div className="api-token-warning">
          <strong>安全提示</strong>
          <span>API Token 等同于只读数据钥匙，请只保存在可信环境；如果怀疑泄露，立即撤销并重新生成。</span>
        </div>

        <div className="api-token-generator">
          <div className="api-scope-control">
            <button
              type="button"
              data-active={apiTokenScope === "all" ? "true" : undefined}
              onClick={() => setApiTokenScope("all")}
            >
              全部
            </button>
            <button
              type="button"
              data-active={apiTokenScope === "tags" ? "true" : undefined}
              onClick={() => setApiTokenScope("tags")}
            >
              指定标签
            </button>
          </div>

          {apiTokenScope === "tags" && (
            <div className="api-scope-tags">
              <Input
                value={apiTokenTagsText}
                onChange={(event) => setApiTokenTagsText(event.target.value)}
                placeholder="输入可读标签，可用逗号、空格或换行分隔"
              />
              <div className="api-scope-tag-list">
                {(availableTags.data?.tags ?? []).map((tagItem) => (
                  <button
                    key={tagItem.id}
                    type="button"
                    data-selected={selectedApiTokenTags.includes(tagItem.name) ? "true" : undefined}
                    onClick={() => toggleApiTokenTag(tagItem.name)}
                  >
                    #{tagItem.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="api-scope-actions">
            <div>
              <strong>当前将保存为</strong>
              <span>
                {apiTokenScope === "tags"
                  ? selectedApiTokenTags.length > 0
                    ? selectedApiTokenTags.map((tagName) => `#${tagName}`).join("、")
                    : "尚未选择标签"
                  : "全部可读"}
              </span>
            </div>
            <Button
              type="button"
              variant={apiTokenScopeDirty ? "primary" : "secondary"}
              size="sm"
              onClick={saveApiTokenScope}
            >
              <Check size={14} />
              保存范围设置
            </Button>
          </div>

          <div className="api-token-input-row">
            <Input
              value={apiTokenName}
              maxLength={64}
              onChange={(event) => setApiTokenName(event.target.value)}
              placeholder="Token 名称"
            />
            <Button
              type="button"
              disabled={apiTokenSubmitting || !apiTokenName.trim() || apiTokenScopeDirty}
              onClick={() => void generateApiToken()}
            >
              <KeyRound size={15} />
              {apiTokenScopeDirty ? "先保存范围" : apiTokenSubmitting ? "生成中" : "生成 Token"}
            </Button>
          </div>

          {generatedToken && (
            <div className="api-generated-token">
              <div>
                <strong>新的 API Token</strong>
                <span>已保存到下方列表，之后可随时查看和复制。</span>
              </div>
              <code>{generatedToken}</code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="api-copy-button"
                onClick={() => void copyApiText(generatedToken, "API Token 已复制")}
              >
                <Copy size={14} />
                复制 Token
              </Button>
            </div>
          )}

          <div className="api-token-list">
            {tokenQuery.isError && <div className="api-token-row api-token-row-muted" role="alert">API Token 加载失败，请稍后重试</div>}
            {apiTokenLoading && <div className="api-token-row api-token-row-muted">正在加载 API Token</div>}
            {!apiTokenLoading && !tokenQuery.isError && apiTokens.length === 0 && (
              <div className="api-token-row api-token-row-muted">还没有可用的 API Token</div>
            )}
            {apiTokens.map((token) => {
              const tokenValue = token.token;
              return (
                <div
                  key={token.id}
                  className="api-token-row"
                >
                  <div>
                    <strong>{token.name}</strong>
                    <span>
                      {token.scope === "tags" ? `指定标签：${token.tags.map((tagName) => `#${tagName}`).join("、")}` : "全部可读"} · 创建于 {formatDateTime(token.createdAt)}
                      {token.lastUsedAt ? ` · 最近使用 ${formatDateTime(token.lastUsedAt)}` : ""}
                    </span>
                    {tokenValue ? (
                      <code className="api-token-value">{tokenValue}</code>
                    ) : (
                      <span className="api-token-row-legacy">创建于旧版本，无法再次查看完整 Token，如需复制请撤销后重新生成</span>
                    )}
                  </div>
                  <div className="api-token-row-actions">
                    {tokenValue && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyApiText(tokenValue, "API Token 已复制")}
                      >
                        <Copy size={14} />
                        复制
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={apiTokenSubmitting}
                      onClick={() => void revokeCurrentApiToken(token.id)}
                    >
                      撤销
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="api-example-block">
          <div className="api-example-header">
            <span>
              <Terminal size={15} />
              curl
            </span>
            <button
              type="button"
              onClick={() => void copyApiText(curlExample, "调用示例已复制")}
            >
              <Copy size={14} />
            </button>
          </div>
          <pre>{curlExample}</pre>
        </div>
      </section>
    </section>
  );
}
