import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

/**
 * 通用文本域组件。
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full resize-none rounded-md border border-border bg-white px-3 py-3 text-sm leading-6 text-foreground outline-none transition",
          "placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15",
          className
        )}
        {...props}
      />
    );
  }
);
