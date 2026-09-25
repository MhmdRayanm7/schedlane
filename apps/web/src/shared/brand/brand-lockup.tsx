import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "./brand-mark";

type BrandLockupProps = HTMLAttributes<HTMLDivElement> & {
  markClassName?: string;
  wordmarkClassName?: string;
};

export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
  ...props
}: BrandLockupProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)} {...props}>
      <BrandMark
        className={cn("size-6 shrink-0 text-primary", markClassName)}
      />
      <span
        className={cn(
          "text-[17px] font-semibold tracking text-foreground",
          wordmarkClassName,
        )}
      >
        Schedlane
      </span>
    </div>
  );
}
