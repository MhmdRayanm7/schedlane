import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 min-w-0 w-full resize-y px-3 py-2.5",
        "rounded-md border border-border-strong bg-surface",
        "text-sm text-foreground placeholder:text-subtle-foreground",
        "transition-colors duration-150 outline-none",
        "enabled:hover:border-muted-foreground",
        "focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "aria-invalid:border-destructive disabled:bg-background disabled:cursor-not-allowed disabled:opacity-65",
        "[@media(pointer:coarse)]:text-base",
        className,
      )}
      {...props}
    />
  );
}
