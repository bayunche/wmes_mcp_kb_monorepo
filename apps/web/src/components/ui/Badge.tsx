import clsx from "clsx";

type BadgeTone = "default" | "subtle" | "info" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  children: string;
  tone?: BadgeTone;
}

export function Badge({ children, tone = "default" }: BadgeProps) {
  return <span className={clsx("badge", tone !== "default" && tone)}>{children}</span>;
}
