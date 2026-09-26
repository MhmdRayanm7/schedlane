import type { ReactNode } from "react";
import styles from "./form-field.module.css";

type FormFieldProps = {
  htmlFor: string;
  label: ReactNode;
  children: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
};

export function FormField({
  htmlFor,
  label,
  children,
  helperText,
  error,
}: FormFieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
      </label>
      {children}
      {helperText ? <p className={styles.helper}>{helperText}</p> : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
