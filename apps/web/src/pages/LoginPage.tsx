import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useLogin } from "../hooks/useAuth";

/**
 * 登录页面。
 */
export function LoginPage() {
  const defaultAccount = import.meta.env.DEV ? (import.meta.env.VITE_DEFAULT_ADMIN_ACCOUNT ?? "") : "";
  const defaultPassword = import.meta.env.DEV ? (import.meta.env.VITE_DEFAULT_ADMIN_PASSWORD ?? "") : "";
  const [account, setAccount] = useState(defaultAccount);
  const [password, setPassword] = useState(defaultPassword);
  const login = useLogin();

  /**
   * 提交登录表单。
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ account, password });
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
          <h1 className="mt-2 text-2xl font-semibold text-foreground">登录账号</h1>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">账号</span>
            <Input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">密码</span>
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <Button className="w-full" disabled={login.isPending}>
            {login.isPending ? "登录中" : "登录"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          还没有账号？{" "}
          <Link className="font-medium text-emerald-700 hover:text-emerald-800" to="/register">
            去注册
          </Link>
        </p>
      </motion.section>
    </main>
  );
}
