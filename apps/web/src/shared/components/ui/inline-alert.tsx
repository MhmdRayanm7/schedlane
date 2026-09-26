import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./inline-alert.module.css";

type InlineAlertProps = ComponentProps<"div"> & {
  as?: "div" | "p";
  variant: "error" | "warning" | "success";
};

export function InlineAlert({
  as: Component = "div",
  variant,
  className,
  role = variant === "success" ? "status" : "alert",
  ...props
}: InlineAlertProps) {
  return (
    <Component
      className={cn(styles.alert, styles[variant], className)}
      role={role}
      {...props}
    />
  );
}
