import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./brand-lockup.module.css";
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
    <div className={cn(styles.lockup, className)} {...props}>
      <BrandMark className={cn(styles.mark, markClassName)} />
      <span className={cn(styles.wordmark, wordmarkClassName)}>Schedlane</span>
    </div>
  );
}
