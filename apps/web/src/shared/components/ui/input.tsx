import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      className={cn(styles.input, className)}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
