import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 min-w-0 w-full rounded-md border border-border-strong bg-surface [@media(pointer:coarse)]:text-base px-3 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-subtle-foreground enabled:hover:border-muted-foreground focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-invalid:border-destructive disabled:bg-background disabled:cursor-not-allowed disabled:opacity-65",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
