import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  size?: "default" | "sm" | "icon";
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "destructive"
    | "destructiveOutline";
};

function Button({
  className,
  variant,
  size,
  type = "button",
  children,
  loading,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        styles.button,
        styles[variant ?? "default"],
        styles[`size-${size ?? "default"}`],
        className,
      )}
      type={type}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading === undefined ? (
        children
      ) : (
        <span className={styles.loadingLayout}>
          <span className={cn(styles.loadingContent, loading && styles.hidden)}>
            {children}
          </span>
          {loading ? (
            <LoaderCircle aria-hidden="true" className={styles.spinner} />
          ) : null}
        </span>
      )}
    </button>
  );
}

export { Button };
