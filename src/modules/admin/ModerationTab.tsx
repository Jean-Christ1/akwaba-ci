import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/shared/lib/edgeError";
import {
  filterPlaces,
  paginate,
  sortPlaces,
  type Filters,
  type Sort,
} from "@/pages/admin/moderation-utils";
import { EmailProbe } from "./EmailProbe";
import { ModerationDecisionDialog, ModerationHistorySheet } from "./ModerationDecision";
import { ModerationFilters } from "./ModerationFilters";
import { ModerationQueue, type Decision } from "./ModerationQueue";
import { RealtimeBanner } from "./RealtimeBanner";
import { decrireFiltres, exporterModerationCsv, type EtapeExport } from "./moderationCsv";
import type { ModerationEventRow, PlaceRow } from "./types";
import { useModerationRealtime } from "./useModerationRealtime";

const TAILLE_PAGE = 10;

const FILTRES_INITIAUX: Filters = {
  search: "",
  city: "all",
  type: "all",
  status: "pending",
  since: "",
};

interface ModerationTabProps {
  pending: PlaceRow[];
  loadBusy: boolean;
  lastLoadedAt: Date | null;
  onReload: () => void;
}

/**
 * File de modération des fiches.
 *
 * Cet onglet tient l'état de la file et les décisions ; l'affichage de la
 * liste, la boîte de dialogue de décision et l'export vivent à côté. Il porte
 * aussi l'abonnement temps réel, qui n'a d'utilité que sous les yeux d'un
 * modérateur : le garder ouvert depuis les autres onglets occuperait une
 * connexion pour un affichage que personne ne regarde.
 */
export function ModerationTab({ pending, loadBusy, lastLoadedAt, onReload }: ModerationTabProps) {
  const [filters, setFilters] = useState<Filters>(FILTRES_INITIAUX);
  const [sort, setSort] = useState<Sort>("date_desc");
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [cible, setCible] = useState<{ place: PlaceRow; action: Decision } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [historique, setHistorique] = useState<ModerationEventRow[]>([]);
  const [fichePourHistorique, setFichePourHistorique] = useState<PlaceRow | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvProgress, setCsvProgress] = useState<EtapeExport | null>(null);

  const realtime = useModerationRealtime(true, onReload);

  const villes = useMemo(
    () => Array.from(new Set(pending.map((p) => p.city).filter(Boolean))).sort(),
    [pending]
  );
  const types = useMemo(
    () => Array.from(new Set(pending.map((p) => p.type).filter(Boolean))).sort(),
    [pending]
  );
  const triees = useMemo(
    () => sortPlaces(filterPlaces(pending, filters), sort),
    [pending, filters, sort]
  );

  const pagination = paginate(triees, page, TAILLE_PAGE);
  const selection = triees.find((p) => p.id === previewId) ?? null;

  const changerFiltres = (suivant: Filters) => {
    setFilters(suivant);
    setPage(1);
  };

  const ouvrirDecision = (place: PlaceRow, action: Decision) => {
    setCible({ place, action });
    setNote("");
  };

  const exporter = async () => {
    setCsvBusy(true);
    const libelle = decrireFiltres(filters);
    try {
      await exporterModerationCsv(triees, filters, setCsvProgress);
      toast.success(`Export CSV - ${triees.length} ligne(s) (${libelle})`);
    } catch (e) {
      toast.error(
        `Export CSV échoué (${libelle}) : ${e instanceof Error ? e.message : "Erreur inattendue"}`
      );
    } finally {
      setCsvBusy(false);
      setTimeout(() => setCsvProgress(null), 800);
    }
  };

  const trancher = async () => {
    if (!cible) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("moderate-place", {
        body: { place_id: cible.place.id, action: cible.action, note: note.trim() || null },
      });
      // La fonction moderate-place écrit le motif exact du refus dans le corps de sa
      // réponse. Relancer l'erreur telle quelle affichait « Edge Function
      // returned a non-2xx status code », le même libellé quelle que soit la
      // cause : l'utilisateur ne savait pas quoi corriger.
      if (error) throw new Error(await edgeErrorMessage(error));
      const res = data as {
        error?: string;
        email?: { status?: string; recipient?: string; detail?: string };
      } | null;
      if (res?.error) throw new Error(res.error);

      const base = cible.action === "approved" ? "Fiche publiée" : "Fiche refusée";
      const courriel = res?.email;
      if (courriel?.status === "sent") {
        toast.success(`${base} - email envoyé à ${courriel.recipient}`);
      } else if (courriel?.status === "failed") {
        toast.error(`${base} mais l'email a échoué : ${courriel.detail ?? "?"}`);
      } else if (courriel?.status === "no_recipient") {
        toast.warning(`${base} - aucun email partenaire connu`);
      } else if (courriel?.status === "not_configured") {
        toast.warning(`${base} - connecteur Resend non configuré`);
      } else {
        toast.success(base);
      }

      logger.debug("[moderate-place] result", res);
      setCible(null);
      setNote("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  };

  const ouvrirHistorique = async (place: PlaceRow) => {
    setFichePourHistorique(place);
    const { data } = await supabase
      .from("place_moderation_events")
      .select("*")
      .eq("place_id", place.id)
      .order("created_at", { ascending: false });
    setHistorique(data ?? []);
  };

  return (
    <div className="space-y-3">
      <RealtimeBanner
        realtime={realtime}
        lastLoadedAt={lastLoadedAt}
        loadBusy={loadBusy}
        onRefresh={onReload}
      />

      <ModerationFilters
        filters={filters}
        onFiltersChange={changerFiltres}
        sort={sort}
        onSortChange={setSort}
        cities={villes}
        types={types}
        total={triees.length}
        page={pagination.page}
        totalPages={pagination.totalPages}
        csvBusy={csvBusy}
        onExport={exporter}
      />

      {csvProgress && (
        <div className="space-y-1 rounded-md border p-2" data-testid="csv-progress">
          <div className="flex justify-between text-xs">
            <span>{csvProgress.step}</span>
            <span>{csvProgress.pct}%</span>
          </div>
          <Progress value={csvProgress.pct} className="h-1.5" />
        </div>
      )}

      <EmailProbe />

      <ModerationQueue
        items={pagination.items}
        total={triees.length}
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={setPage}
        selection={selection}
        onSelect={setPreviewId}
        onDecide={ouvrirDecision}
        onHistory={ouvrirHistorique}
      />

      <ModerationDecisionDialog
        target={cible}
        note={note}
        onNoteChange={setNote}
        busy={busy}
        onCancel={() => setCible(null)}
        onConfirm={trancher}
      />

      <ModerationHistorySheet
        place={fichePourHistorique}
        events={historique}
        onClose={() => setFichePourHistorique(null)}
      />
    </div>
  );
}

export default ModerationTab;
