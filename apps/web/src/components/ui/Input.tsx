import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * 通用输入框组件。
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground outline-none transition",
        "placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15",
        className
      )}
      {...props}
    />
  );
}
