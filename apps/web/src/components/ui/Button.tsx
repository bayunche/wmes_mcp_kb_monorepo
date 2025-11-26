import { ButtonHTMLAttributes, ReactElement, ReactNode, cloneElement, isValidElement } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  children: ReactNode;
  asChild?: boolean;
}

export function Button({ variant = "primary", children, className, asChild = false, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
  const tone =
    variant === "ghost"
      ? "border border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white/90"
      : variant === "danger"
        ? "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-400"
        : "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400";
  const baseClass = clsx(base, tone);

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement, {
      className: clsx(baseClass, className, (children as ReactElement).props.className),
      ...rest
    });
  }

  return (
    <button
      className={clsx(baseClass, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
