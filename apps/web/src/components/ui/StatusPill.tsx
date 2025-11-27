import clsx from "clsx";

interface StatusPillProps {
  children: string;
  tone?: "info" | "success" | "warning" | "danger";
}

export function StatusPill({ children, tone = "info" }: StatusPillProps) {
  return <span className={clsx("status-pill", tone)}>{children}</span>;
}
