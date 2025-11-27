import { ReactNode } from "react";
import clsx from "clsx";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  className?: string;
}

export function SectionHeader({ eyebrow, title, description, status, className }: SectionHeaderProps) {
  return (
    <header className={clsx("section-header", className)}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="muted-text">{description}</p>}
      </div>
      {status}
    </header>
  );
}
