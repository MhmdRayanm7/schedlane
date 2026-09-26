import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

const buttonVariants = cva(
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
        outline:
          "border border-border-strong bg-surface text-foreground hover:bg-surface-hover",
        ghost:
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        destructive:
          "bg-destructive text-surface hover:bg-destructive/90 active:bg-destructive/90",
        destructiveOutline:
          "border border-destructive/25 bg-surface text-destructive hover:bg-destructive-subtle",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-xs",
        icon: "size-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { loading?: boolean };

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
      className={cn(buttonVariants({ variant, size }), className)}
      type={type}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading === undefined ? (
        children
      ) : (
        <span className="relative inline-flex items-center justify-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-2",
              loading && "opacity-0",
            )}
          >
            {children}
          </span>
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="absolute size-4 animate-spin"
            />
          ) : null}
        </span>
      )}
    </button>
  );
}

export { Button, buttonVariants };
