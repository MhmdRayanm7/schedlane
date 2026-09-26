import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./textarea.module.css";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(styles.textarea, className)} {...props} />;
}
