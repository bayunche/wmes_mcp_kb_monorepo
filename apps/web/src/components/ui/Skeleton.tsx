import type { CSSProperties } from "react";
import clsx from "clsx";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "pill";
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, rounded = "md", className, style }: SkeletonProps) {
  return (
    <div
      className={clsx("skeleton", `skeleton--${rounded}`, className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}
