import { useEffect, useRef, useState } from "react";

import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

export interface RealtimeState {
  status: RealtimeStatus;
  attempt: number;
  error: string | null;
  lastRetryAt: Date | null;
  nextRetryAt: Date | null;
  nextDelayMs: number | null;
  retry: () => void;
}

/** Attente avant nouvelle tentative, plafonnée pour ne pas marteler le serveur. */
const delaiAvantReprise = (tentative: number) =>
  Math.min(30_000, 1000 * 2 ** Math.min(tentative - 1, 5));

/**
 * Abonnement temps réel de la file de modération.
 *
 * Une file de modération qui se fige sans le dire fait travailler sur un état
 * périmé : deux modérateurs peuvent alors trancher la même fiche. L'état de la
 * connexion est donc exposé à l'écran, avec sa reprise automatique et son motif
 * d'échec expurgé de tout jeton et de toute adresse de service.
 */
export function useModerationRealtime(active: boolean, onChange: () => void): RealtimeState {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastRetryAt, setLastRetryAt] = useState<Date | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<Date | null>(null);
  const [nextDelayMs, setNextDelayMs] = useState<number | null>(null);

  // La fonction de rafraîchissement change à chaque rendu du parent : la garder
  // dans une référence évite de résilier et rouvrir le canal sans raison.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let tentative = 0;

    const connect = () => {
      tentative += 1;
      setAttempt(tentative);
      setStatus("connecting");
      setError(null);
      channel = supabase
        .channel(`admin-places-rt-${tentative}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "places" }, (payload) => {
          logger.debug("[realtime places]", payload.eventType);
          onChangeRef.current();
        })
        .subscribe((etat, err) => {
          if (cancelled) return;
          if (etat === "SUBSCRIBED") {
            setStatus("connected");
            setError(null);
            setNextRetryAt(null);
            setNextDelayMs(null);
          } else if (etat === "CHANNEL_ERROR" || etat === "TIMED_OUT" || etat === "CLOSED") {
            const brut = err?.message ?? etat;
            const sur = String(brut)
              .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
              .replace(/https?:\/\/\S+/g, "[url]")
              .slice(0, 160);
            console.warn("[realtime] failed", etat, err);
            setStatus("error");
            setError(sur);
            setLastRetryAt(new Date());
            if (channel) supabase.removeChannel(channel);
            const delai = delaiAvantReprise(tentative);
            setNextDelayMs(delai);
            setNextRetryAt(new Date(Date.now() + delai));
            retryTimer = setTimeout(connect, delai);
          }
        });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [active]);

  const retry = () => {
    setAttempt((a) => a + 1);
    setStatus("connecting");
    setError(null);
    setLastRetryAt(new Date());
    setNextRetryAt(null);
    setNextDelayMs(null);
    supabase.realtime.connect();
    onChangeRef.current();
  };

  return { status, attempt, error, lastRetryAt, nextRetryAt, nextDelayMs, retry };
}
