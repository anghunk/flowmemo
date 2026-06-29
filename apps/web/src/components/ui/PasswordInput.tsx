import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/cn";
import { Input } from "./Input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * 支持切换明文/密文显示的密码输入框。
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        className={cn("pr-10", className)}
        type={visible ? "text" : "password"}
        {...props}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:bg-emerald-50 hover:text-foreground"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        title={visible ? "隐藏密码" : "显示密码"}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
