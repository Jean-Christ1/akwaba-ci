import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

/** Indicateur du tableau de bord. */
export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

/** Ligne clé-valeur des panneaux de détail. */
export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

const TONS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-accent-soft text-accent-foreground",
  published: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  new: "bg-primary-soft text-primary",
  in_review: "bg-accent-soft text-accent-foreground",
  contacted: "bg-success/15 text-success",
  closed: "bg-muted text-muted-foreground",
};

/** Pastille de statut, partagée par les fiches et les demandes. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${TONS[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}
