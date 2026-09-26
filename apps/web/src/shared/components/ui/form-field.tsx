import type { ReactNode } from "react";

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
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {children}
      {helperText ? (
        <p className="text-xs text-subtle-foreground">{helperText}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
