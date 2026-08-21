import { useMemo } from "react";
import { Check, MapPin, Store, TrendingUp } from "lucide-react";

import { Kpi } from "./primitives";
import type { LeadRow, PlaceRow } from "./types";

/**
 * Vue d'entrée du partenaire.
 *
 * Quatre nombres seulement : ce qui existe, ce qui est visible, ce qui attend
 * la modération et ce qui attend une réponse. Un partenaire ouvre le
 * back-office pour savoir s'il a quelque chose à faire aujourd'hui.
 */
export function DashboardTab({ places, leads }: { places: PlaceRow[]; leads: LeadRow[] }) {
  const stats = useMemo(
    () => ({
      total: places.length,
      published: places.filter((p) => p.status === "published").length,
      pending: places.filter((p) => p.status === "pending").length,
      leadsNew: leads.filter((l) => l.status === "new").length,
    }),
    [places, leads]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={Store} label="Mes fiches" value={stats.total} hint="toutes statuts" />
      <Kpi icon={Check} label="Publiées" value={stats.published} hint="visibles" />
      <Kpi icon={MapPin} label="En attente" value={stats.pending} hint="modération" />
      <Kpi icon={TrendingUp} label="Demandes nouvelles" value={stats.leadsNew} hint="à traiter" />
    </div>
  );
}

export default DashboardTab;
