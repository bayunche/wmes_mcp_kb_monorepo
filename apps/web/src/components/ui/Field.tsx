import { ReactNode } from "react";
import clsx from "clsx";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <label className={clsx("flex flex-col gap-1 text-sm", className)}>
      <span className="ui-field__label">{label}</span>
      {children}
      {hint && !error && <small className="ui-field__hint">{hint}</small>}
      {error && <small className="ui-field__error">{error}</small>}
    </label>
  );
}
