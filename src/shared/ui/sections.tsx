import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface CategoryChipProps {
  to: string;
  label: string;
  emoji?: string;
}

export function CategoryChip({ to, label, emoji }: CategoryChipProps) {
  return (
    <Link
      to={to}
      className="flex flex-shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-elevation-1 transition-all hover:border-primary/40 hover:bg-primary-soft hover:-translate-y-0.5"
    >
      {emoji && <span>{emoji}</span>}
      <span>{label}</span>
    </Link>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaTo,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="akw-eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="akw-section-title text-balance">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="hidden flex-shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
