import { FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  normalizeRegisterAccount,
  normalizeRegisterInviteCode,
  validateRegisterAccount,
  validateRegisterInviteCode
} from "@flowmemo/shared";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useRegister } from "../hooks/useAuth";

/**
 * 注册页面。
 */
export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const initialInviteCode = useMemo(
    () => normalizeRegisterInviteCode(searchParams.get("inviteCode") ?? searchParams.get("code")),
    [searchParams]
  );
  const [account, setAccount] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const register = useRegister();

  /**
   * 提交注册表单。
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAccount = normalizeRegisterAccount(account);
    const normalizedInviteCode = normalizeRegisterInviteCode(inviteCode);
    const accountError = validateRegisterAccount(normalizedAccount);
    const inviteCodeError = validateRegisterInviteCode(normalizedInviteCode);
    if (accountError) {
      toast.error(accountError);
      return;
    }
    if (inviteCodeError) {
      toast.error(inviteCodeError);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    register.mutate({ account: normalizedAccount, password, inviteCode: normalizedInviteCode });
  }

  return (
    <main className="auth-shell">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="auth-panel"
      >
        <div>
          <p className="text-sm font-medium text-emerald-700">FlowMemo</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">创建账号</h1>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">邮箱</span>
            <Input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              autoComplete="email"
              inputMode="email"
              type="email"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">邀请码（可选）</span>
            <Input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              autoComplete="one-time-code"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">密码</span>
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">确认密码</span>
            <PasswordInput
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <Button className="w-full" disabled={register.isPending}>
            {register.isPending ? "创建中" : "创建账号"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          已有账号？{" "}
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" to="/login">
            去登录
          </Link>
        </p>
      </motion.section>
    </main>
  );
}
