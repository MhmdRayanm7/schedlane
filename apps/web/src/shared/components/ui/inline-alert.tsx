import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

const alertVariants = cva("rounded-md border px-3 py-2.5 text-sm", {
  variants: {
    variant: {
      error: "border-destructive/25 bg-destructive-subtle text-destructive",
      warning: "border-warning/25 bg-warning-subtle text-warning",
      success: "border-primary/25 bg-primary-subtle text-primary",
    },
  },
});

type InlineAlertProps = ComponentProps<"div"> & {
  as?: "div" | "p";
  variant: NonNullable<VariantProps<typeof alertVariants>["variant"]>;
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
      className={cn(alertVariants({ variant }), className)}
      role={role}
      {...props}
    />
  );
}
