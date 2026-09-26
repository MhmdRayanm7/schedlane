import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 min-w-0 w-full px-3",
        "rounded-md border border-border-strong bg-surface",
        "text-sm text-foreground placeholder:text-subtle-foreground",
        "transition-colors duration-150 outline-none",
        "enabled:hover:border-muted-foreground",
        "focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "aria-invalid:border-destructive disabled:bg-background disabled:cursor-not-allowed disabled:opacity-65",
        "[@media(pointer:coarse)]:text-base",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
