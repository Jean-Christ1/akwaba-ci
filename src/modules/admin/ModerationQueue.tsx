import { Link } from "react-router-dom";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./primitives";
import type { PlaceRow } from "./types";

export type Decision = "approved" | "rejected";

interface ModerationQueueProps {
  items: PlaceRow[];
  /** Nombre de fiches retenues par les filtres, toutes pages confondues. */
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  selection: PlaceRow | null;
  onSelect: (id: string) => void;
  onDecide: (place: PlaceRow, action: Decision) => void;
  onHistory: (place: PlaceRow) => void;
}

/**
 * Liste des fiches à instruire et aperçu de celle qui est sélectionnée.
 *
 * L'aperçu reste à côté de la liste plutôt que d'ouvrir une page : un
 * modérateur enchaîne les fiches et perdrait sa position à chaque
 * aller-retour. Sur mobile, l'aperçu disparaît, la liste seule tient l'écran.
 */
export function ModerationQueue({
  items,
  total,
  page,
  totalPages,
  onPageChange,
  selection,
  onSelect,
  onDecide,
  onHistory,
}: ModerationQueueProps) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-2">
          {items.map((p) => (
            <Card
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 p-3 transition-colors ${
                selection?.id === p.id
                  ? "border-primary bg-primary-soft/40 ring-1 ring-primary/30"
                  : "hover:border-primary/30"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <StatusBadge status={p.status} />
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.city} · {p.type} · {p.address}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Link to={`/admin/places/${p.id}`}>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onDecide(p, "rejected")}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" className="h-8" onClick={() => onDecide(p, "approved")}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
          {total === 0 && (
            <p className="py-8 text-center text-muted-foreground">Aucune fiche ne correspond.</p>
          )}
        </div>

        <aside className="hidden lg:block">
          {!selection ? (
            <Card className="sticky top-20 p-6 text-center text-xs text-muted-foreground">
              Sélectionnez une fiche pour prévisualiser ses détails ici.
            </Card>
          ) : (
            <Card className="sticky top-20 space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg leading-tight">{selection.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selection.city} · {selection.type}
                  </p>
                </div>
                <StatusBadge status={selection.status} />
              </div>
              {selection.image && (
                <img
                  src={selection.image}
                  alt={selection.name}
                  className="aspect-video w-full rounded-md object-cover"
                  loading="lazy"
                />
              )}
              <p className="line-clamp-6 text-xs text-muted-foreground">{selection.description}</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onHistory(selection)}>
                  Historique
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onDecide(selection, "rejected")}
                >
                  <X className="h-4 w-4" /> Refuser
                </Button>
                <Button size="sm" className="flex-1" onClick={() => onDecide(selection, "approved")}>
                  <Check className="h-4 w-4" /> Valider
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ← Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Suivant →
          </Button>
        </div>
      )}
    </>
  );
}

export default ModerationQueue;
