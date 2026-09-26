import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input className={cn(styles.input, className)} type={type} {...props} />
  );
}
