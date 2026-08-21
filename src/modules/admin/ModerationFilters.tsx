import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Filters, Sort } from "@/pages/admin/moderation-utils";

interface ModerationFiltersProps {
  filters: Filters;
  onFiltersChange: (suivant: Filters) => void;
  sort: Sort;
  onSortChange: (suivant: Sort) => void;
  cities: string[];
  types: string[];
  /** Nombre de fiches retenues et pagination, pour situer l'export. */
  total: number;
  page: number;
  totalPages: number;
  csvBusy: boolean;
  onExport: () => void;
}

const FILTRES_PAR_DEFAUT: Filters = {
  search: "",
  city: "all",
  type: "all",
  status: "pending",
  since: "",
};

const estFiltre = (f: Filters) =>
  f.search !== "" || f.city !== "all" || f.type !== "all" || f.status !== "pending" || f.since !== "";

/**
 * Filtres de la file de modération.
 *
 * Les listes de villes et de types sont construites à partir de la file
 * elle-même : proposer un filtre qui ne correspond à aucune fiche en attente
 * ferait chercher dans le vide.
 */
export function ModerationFilters({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  cities,
  types,
  total,
  page,
  totalPages,
  csvBusy,
  onExport,
}: ModerationFiltersProps) {
  const maj = (partiel: Partial<Filters>) => onFiltersChange({ ...filters, ...partiel });

  return (
    <Card className="grid gap-2 p-3 sm:grid-cols-6">
      <Input
        placeholder="Recherche nom, adresse…"
        value={filters.search}
        onChange={(e) => maj({ search: e.target.value })}
        className="sm:col-span-2"
      />
      <select
        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        value={filters.city}
        onChange={(e) => maj({ city: e.target.value })}
        aria-label="Filtrer par ville"
      >
        <option value="all">Toutes villes</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        value={filters.type}
        onChange={(e) => maj({ type: e.target.value })}
        aria-label="Filtrer par type"
      >
        <option value="all">Tous types</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        value={filters.status}
        onChange={(e) => maj({ status: e.target.value as Filters["status"] })}
        aria-label="Filtrer par statut"
      >
        <option value="pending">En attente</option>
        <option value="rejected">Refusées</option>
        <option value="all">Toutes</option>
      </select>
      <select
        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as Sort)}
        aria-label="Trier la file"
      >
        <option value="date_desc">Tri : Date ↓</option>
        <option value="date_asc">Tri : Date ↑</option>
        <option value="status">Tri : Statut</option>
        <option value="city">Tri : Ville</option>
      </select>
      <Input
        type="date"
        value={filters.since}
        onChange={(e) => maj({ since: e.target.value })}
        className="sm:col-span-2"
        aria-label="Fiches déposées depuis"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground sm:col-span-4">
        <span>
          {total} fiche(s) - page {page}/{totalPages}
        </span>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            data-testid="csv-export"
            onClick={onExport}
            disabled={total === 0 || csvBusy}
          >
            {csvBusy ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Export…
              </>
            ) : (
              "Exporter CSV"
            )}
          </Button>
          {estFiltre(filters) && (
            <button
              className="underline hover:text-foreground"
              onClick={() => onFiltersChange(FILTRES_PAR_DEFAUT)}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default ModerationFilters;
