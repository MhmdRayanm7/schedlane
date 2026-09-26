import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
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
  loadingLabel,
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
      ) : loading && loadingLabel ? (
        <span className={styles.loadingLayout}>
          <span className={cn(styles.loadingContent, styles.hidden)}>
            {children}
          </span>
          <span className={styles.loadingLabel}>
            <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} />
            {loadingLabel}
          </span>
        </span>
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
