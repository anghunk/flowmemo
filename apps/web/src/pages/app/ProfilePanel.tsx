import {
  X
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useMe, useUpdateProfile } from "../../hooks/useAuth";
import {
  useOverviewStats
} from "../../hooks/useMemos";
import { api, ApiError } from "../../lib/api";
import { formatProfileDate } from "./format";

/** 个人资料弹窗仅向工作台暴露关闭和订阅入口。 */
type ProfilePanelProps = {
  onClose: () => void;
  onOpenSubscription: () => void;
};

/** 管理个人资料展示、昵称和密码表单，隔离工作台状态。 */
export function ProfilePanel({ onClose, onOpenSubscription }: ProfilePanelProps) {
  const { data } = useMe();
  const overview = useOverviewStats();
  const updateProfile = useUpdateProfile();
  const account = data?.user.account ?? "";
  const nickname = data?.user.nickname ?? "";
  const plan = data?.user.plan ?? "free";
  const createdAt = data?.user.createdAt;
  const totalMemos = overview.data?.totalMemos ?? 0;
  const totalTags = overview.data?.totalTags ?? 0;
  const activeDays = overview.data?.activeDays ?? 0;
  const profileSubmitting = updateProfile.isPending;
  const [oldPassword, setOldPassword] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  /**
   * 提交修改密码表单。
   */
  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setPasswordSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordDialogOpen(false);
      toast.success("密码已更新");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "修改失败");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  /**
   * 提交昵称修改表单。
   */
  function handleProfileChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateProfile.mutate(
      { nickname: nicknameDraft },
      {
        onSuccess: () => setNicknameDialogOpen(false),
      },
    );
  }

  /**
   * 打开昵称修改弹窗，并带入当前资料值。
   */
  function openNicknameDialog() {
    setNicknameDraft(nickname);
    setNicknameDialogOpen(true);
  }

  /**
   * 打开密码修改弹窗，并重置未提交的输入。
   */
  function openPasswordDialog() {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordDialogOpen(true);
  }

  const displayNickname = nickname.trim() || "未设置昵称";

  return (
    <section
      className="profile-detail-panel"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="profile-detail-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-detail-header">
          <h2 id="profile-detail-title">账号详情</h2>
          <button
            type="button"
            className="profile-detail-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="profile-detail-body">
          <div className="profile-detail-group">
            <p className="profile-detail-label">基本信息</p>
            <div className="profile-detail-card profile-detail-summary">
              <div className="profile-detail-main">
                <div className="profile-detail-title">
                  <strong>{displayNickname}</strong>
                  <span
                    className="profile-detail-plan"
                    data-plan={plan}
                  >
                    {plan === "member" ? "PRO" : "FREE"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="profile-detail-edit-button"
                onClick={openNicknameDialog}
              >
                修改
              </button>
            </div>
          </div>

          <div className="profile-detail-group">
            <p className="profile-detail-label">账号设置</p>
            <div className="profile-detail-card">
              <div className="profile-detail-row">
                <div>
                  <strong>账号</strong>
                  <span>{account}</span>
                </div>
              </div>
              <div className="profile-detail-row ">
                <div>
                  <strong>密码</strong>
                </div>
                <button
                  type="button"
                  className="profile-detail-edit-button"
                  onClick={openPasswordDialog}
                >
                  修改
                </button>
              </div>
            </div>
          </div>

          <div className="profile-detail-group">
            <p className="profile-detail-label">会员与数据</p>
            <div className="profile-detail-card">
              <div className="profile-detail-row">
                <div>
                  <strong>当前订阅</strong>
                </div>
                <button
                  type="button"
                  className="profile-detail-edit-button"
                  onClick={onOpenSubscription}
                >
                  {plan === "member" ? "PRO" : "FREE"}
                </button>
              </div>
              <div className="profile-detail-row">
                <div>
                  <strong>注册时间</strong>
                </div>
                <span>{formatProfileDate(createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {nicknameDialogOpen && (
        <div
          className="nickname-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation();
            setNicknameDialogOpen(false);
          }}
        >
          <form
            className="nickname-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nickname-dialog-title"
            onSubmit={handleProfileChange}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="nickname-dialog-header">
              <h3 id="nickname-dialog-title">修改昵称</h3>
              <button
                type="button"
                className="nickname-dialog-close"
                aria-label="关闭"
                onClick={() => setNicknameDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <Input
              value={nicknameDraft}
              onChange={(event) => setNicknameDraft(event.target.value)}
              placeholder="设置昵称"
              maxLength={32}
              autoFocus
            />
            <div className="nickname-dialog-actions">
              <Button
                type="button"
                variant="ghost"
                className="nickname-dialog-cancel"
                onClick={() => setNicknameDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="nickname-dialog-save"
                disabled={profileSubmitting}
              >
                {profileSubmitting ? "保存中" : "保存"}
              </Button>
            </div>
          </form>
        </div>
      )}
      {passwordDialogOpen && (
        <div
          className="password-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation();
            setPasswordDialogOpen(false);
          }}
        >
          <form
            className="password-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-dialog-title"
            onSubmit={handlePasswordChange}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-dialog-header">
              <h3 id="password-dialog-title">修改密码</h3>
              <button
                type="button"
                className="password-dialog-close"
                aria-label="关闭"
                onClick={() => setPasswordDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="password-dialog-fields">
              <PasswordInput
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                placeholder="旧密码"
                autoComplete="current-password"
                autoFocus
              />
              <PasswordInput
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="新密码（至少8位）"
                autoComplete="new-password"
                minLength={8}
              />
              <PasswordInput
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="password-dialog-footer">
              <div className="password-dialog-actions">
                <Button
                  type="button"
                  variant="ghost"
                  className="password-dialog-cancel"
                  onClick={() => setPasswordDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="password-dialog-confirm"
                  disabled={passwordSubmitting || !oldPassword || !newPassword || !confirmPassword}
                >
                  {passwordSubmitting ? "更新中" : "确定"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
