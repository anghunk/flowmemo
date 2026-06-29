import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "icon";
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-emerald-700",
  secondary: "border border-border bg-white text-foreground hover:bg-emerald-50",
  ghost: "text-muted-foreground hover:bg-emerald-50 hover:text-foreground",
  danger: "bg-rose-600 text-white hover:bg-rose-700"
};

const sizeClass = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  icon: "h-9 w-9 p-0"
};

/**
 * 通用按钮组件。
 */
export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...props}
    />
  );
}
