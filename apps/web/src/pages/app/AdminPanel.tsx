import type { AdminInviteCode, AdminUser } from "@flowmemo/shared";
import {
  Copy,
  KeyRound,
  Search
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import {
  useAdminInvites,
  useAdminUsers,
  useCreateAdminInvite,
  useUpdateInviteRegistration,
  useUpdateUserMembership,
} from "../../hooks/useAdmin";
import { formatDateTime } from "./format";

/**
 * 生成当前站点下的注册邀请链接。
 */
function getRegisterInviteUrl(code: string): string {
  const path = `/register?code=${encodeURIComponent(code)}`;
  if (typeof window === "undefined") {
    return path;
  }
  return new URL(path, window.location.origin).toString();
}

/**
 * 管理用户会员、注册开关与邀请码。
 */
export function AdminPanel() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const users = useAdminUsers({ q: search.trim() || undefined, cursor, limit: 50 });
  const invites = useAdminInvites();
  const createInvite = useCreateAdminInvite();
  const updateInviteRegistration = useUpdateInviteRegistration();
  const updateMembership = useUpdateUserMembership();

  function handleSearchChange(value: string) {
    setSearch(value);
    setCursor(undefined);
  }

  function updateUserPlan(user: AdminUser) {
    updateMembership.mutate({
      id: user.id,
      plan: user.plan === "member" ? "free" : "member",
      membershipExpiresAt: null,
    });
  }

  function toggleInviteRegistration() {
    const current = invites.data?.registrationEnabled ?? false;
    updateInviteRegistration.mutate({ registrationEnabled: !current });
  }

  async function copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("邀请码已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function copyInviteLink(code: string) {
    try {
      await navigator.clipboard.writeText(getRegisterInviteUrl(code));
      toast.success("邀请链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  function renderInviteRow(code: AdminInviteCode) {
    const used = Boolean(code.usedByUserId);
    return (
      <div
        key={code.code}
        className="admin-invite-row"
      >
        <div className="admin-invite-main">
          <strong>{code.code}</strong>
          <span>{used ? `使用于 ${formatDateTime(code.usedAt)}` : `创建于 ${formatDateTime(code.createdAt)}`}</span>
        </div>
        <span
          className="admin-invite-status"
          data-used={used ? "true" : undefined}
        >
          {used ? "已使用" : "可使用"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={used}
          onClick={() => void copyInviteCode(code.code)}
        >
          <Copy size={14} />
          复制
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={used}
          onClick={() => void copyInviteLink(code.code)}
        >
          <Copy size={14} />
          链接
        </Button>
      </div>
    );
  }

  return (
    <section className="admin-panel">
      <div className="admin-invite-panel">
        <div className="admin-invite-header">
          <div>
            <p className="settings-label">注册模式</p>
            <h2 className="settings-title">注册入口</h2>
          </div>
          <span
            className="admin-invite-switch-state"
            data-enabled={invites.data?.registrationEnabled ? "true" : undefined}
          >
            {invites.data?.registrationEnabled ? "邀请码模式" : "开放注册"}
          </span>
        </div>
        <div className="admin-invite-actions">
          <Button
            type="button"
            variant={invites.data?.registrationEnabled ? "ghost" : "secondary"}
            disabled={updateInviteRegistration.isPending || invites.isLoading}
            onClick={toggleInviteRegistration}
          >
            {invites.data?.registrationEnabled ? "改为开放注册" : "开启邀请码模式"}
          </Button>
          <Button
            type="button"
            disabled={createInvite.isPending}
            onClick={() => createInvite.mutate()}
          >
            <KeyRound size={15} />
            {createInvite.isPending ? "生成中" : "生成邀请码"}
          </Button>
        </div>
        <div
          className="admin-invite-list"
          aria-busy={invites.isLoading}
        >
          {invites.isLoading && <div className="admin-row admin-row-muted">正在加载邀请码</div>}
          {invites.isError && <div className="admin-row admin-row-muted">邀请码加载失败</div>}
          {invites.data?.codes.length === 0 && <div className="admin-row admin-row-muted">还没有邀请码</div>}
          {invites.data?.codes.map(renderInviteRow)}
        </div>
      </div>

      <div className="admin-toolbar">
        <div>
          <p className="settings-label">运营管理</p>
          <h2 className="settings-title">用户会员</h2>
        </div>
        <div className="admin-search">
          <Search size={15} />
          <Input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索账号或昵称"
          />
        </div>
      </div>

      <div
        className="admin-user-list"
        aria-busy={users.isLoading}
      >
        {users.isLoading && <div className="admin-row admin-row-muted">正在加载用户</div>}
        {users.isError && <div className="admin-row admin-row-muted">用户列表加载失败</div>}
        {users.data?.users.length === 0 && <div className="admin-row admin-row-muted">没有匹配用户</div>}
        {users.data?.users.map((user) => (
          <div
            key={user.id}
            className="admin-user-row"
          >
            <div className="admin-user-main">
              <div className="admin-user-title">
                <strong>{user.nickname || user.account}</strong>
                <span data-plan={user.plan}>{user.plan === "member" ? "PRO" : "FREE"}</span>
              </div>
              <span>{user.account}</span>
            </div>
            <div className="admin-user-meta">{user.role === "admin" && <span>管理员</span>}</div>
            <Button
              type="button"
              variant={user.plan === "member" ? "ghost" : "secondary"}
              size="sm"
              disabled={updateMembership.isPending}
              onClick={() => updateUserPlan(user)}
            >
              {user.plan === "member" ? "取消会员" : "设为会员"}
            </Button>
          </div>
        ))}
      </div>

      {users.data?.nextCursor && (
        <div className="admin-footer">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCursor(users.data.nextCursor ?? undefined)}
          >
            下一页
          </Button>
        </div>
      )}
    </section>
  );
}
