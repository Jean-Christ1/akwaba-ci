import { AlertTriangle, ChevronDown, Radio, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { RealtimeState } from "./useModerationRealtime";

const heure = (d: Date | null) => (d ? d.toLocaleTimeString("fr-FR") : "-");
const delai = (ms: number | null) =>
  ms == null ? "-" : ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`;

interface RealtimeBannerProps {
  realtime: RealtimeState;
  lastLoadedAt: Date | null;
  loadBusy: boolean;
  onRefresh: () => void;
}

/**
 * État de la liaison temps réel de la file de modération.
 *
 * Une file figée sans avertissement fait trancher sur des fiches déjà traitées.
 * La bannière dit donc l'état de la connexion, l'heure de la dernière mise à
 * jour, et laisse toujours une reprise manuelle sous la main.
 */
export function RealtimeBanner({ realtime, lastLoadedAt, loadBusy, onRefresh }: RealtimeBannerProps) {
  const { status } = realtime;

  return (
    <div
      data-testid="rt-status"
      className={`space-y-1 rounded-md border px-3 py-2 text-xs ${
        status === "connected"
          ? "border-success/30 bg-success/10 text-success"
          : status === "error"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "bg-muted/40 text-muted-foreground"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {status === "connected" && (
          <>
            <Radio className="h-3.5 w-3.5" />
            <span className="flex-1">Connecté - temps réel actif.</span>
          </>
        )}
        {status === "connecting" && (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="flex-1">Connexion temps réel… (tentative {realtime.attempt})</span>
          </>
        )}
        {status === "error" && (
          <>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="flex-1">Déconnecté - les mises à jour peuvent être retardées.</span>
          </>
        )}
        {status === "idle" && <span className="flex-1">Temps réel en attente d'activation…</span>}
        <span className="text-muted-foreground">Dernière maj : {heure(lastLoadedAt)}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={onRefresh}
          disabled={loadBusy}
          data-testid="manual-refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadBusy ? "animate-spin" : ""}`} /> Rafraîchir
        </Button>
        {status === "error" && (
          <Button size="sm" variant="outline" className="h-7" onClick={realtime.retry}>
            Réessayer temps réel
          </Button>
        )}
      </div>

      {status === "error" && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 pl-5 text-[11px] underline opacity-80 hover:opacity-100">
            <ChevronDown className="h-3 w-3" /> Détails diagnostic
          </CollapsibleTrigger>
          <CollapsibleContent
            className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5 pt-1 text-[11px] opacity-90"
            data-testid="rt-diagnostics"
          >
            <span>Tentatives : {realtime.attempt}</span>
            <span>Dernière tentative : {heure(realtime.lastRetryAt)}</span>
            <span>
              Prochaine : {heure(realtime.nextRetryAt)} (dans {delai(realtime.nextDelayMs)})
            </span>
            {realtime.error && <span className="break-all">Motif : {realtime.error}</span>}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default RealtimeBanner;
