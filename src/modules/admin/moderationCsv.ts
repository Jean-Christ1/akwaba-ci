import { supabase } from "@/integrations/supabase/client";
import {
  buildCsvFilename,
  buildModerationCsv,
  type Filters,
  type ModerationEvent,
} from "@/pages/admin/moderation-utils";
import type { PlaceRow } from "./types";

export interface EtapeExport {
  step: string;
  pct: number;
}

/** Résumé lisible des filtres, pour que l'export sache de quoi il parle. */
export function decrireFiltres(f: Filters): string {
  return (
    [
      f.city !== "all" && `ville=${f.city}`,
      f.status !== "all" && `statut=${f.status}`,
      f.type !== "all" && `type=${f.type}`,
      f.since && `depuis=${f.since}`,
    ]
      .filter(Boolean)
      .join(", ") || "aucun filtre"
  );
}

/**
 * Export CSV de la file de modération.
 *
 * Le fichier joint à chaque fiche sa dernière décision : un export qui ne
 * porterait que les fiches obligerait à rouvrir l'application pour savoir
 * pourquoi l'une d'elles a été refusée, ce qui vide l'export de son intérêt.
 *
 * Le téléchargement est déclenché ici parce qu'il est indissociable de la
 * génération : le fichier n'existe que le temps de l'enregistrer.
 */
export async function exporterModerationCsv(
  rows: PlaceRow[],
  filters: Filters,
  onProgress: (etape: EtapeExport) => void
): Promise<void> {
  onProgress({ step: "Préparation…", pct: 5 });

  const ids = rows.map((r) => r.id);
  const parFiche: Record<string, ModerationEvent | undefined> = {};

  if (ids.length) {
    onProgress({ step: "Chargement des événements…", pct: 35 });
    const { data: events, error } = await supabase
      .from("place_moderation_events")
      .select("id, place_id, action, note, created_at")
      .in("place_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const e of events ?? []) {
      if (!parFiche[e.place_id]) parFiche[e.place_id] = e as ModerationEvent;
    }
  }

  onProgress({ step: "Génération du fichier…", pct: 75 });
  const csv = buildModerationCsv(rows, parFiche);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = buildCsvFilename(filters);
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);

  onProgress({ step: "Terminé", pct: 100 });
}
