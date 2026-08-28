import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Canal {
  canal: string;
  porteur: string | null;
  porteur_actif: boolean;
  en_attente: number;
  plus_ancien: string | null;
  remis: number;
  en_echec: number;
  verdict: string;
}

const NOM: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Courriel",
  in_app: "Dans l'application",
};

/**
 * L'état de la file d'envoi, canal par canal.
 *
 * La carte voisine dit si le porteur WhatsApp tourne. Elle ne dit rien des
 * trois autres canaux, et c'est là qu'était le trou : un seul canal a un
 * porteur. Le routage retombe sur le courriel dès que la personne n'a accepté
 * ni WhatsApp ni le SMS, ce qui est le cas de presque tout le monde, et le
 * message y reste en attente pour toujours.
 *
 * Ce n'est pas un envoi qui échoue, ce qui se verrait. C'est un message qui ne
 * part jamais, dans une table que personne ne regarde, pendant que la console
 * dit « déposé » et que l'expéditeur attend une réponse.
 *
 * Cette carte ne répare rien. Elle nomme ce que la plateforme ne sait pas
 * faire, pour que le silence cesse d'être pris pour un succès.
 */
export function FileSanteCard() {
  const [canaux, setCanaux] = useState<Canal[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase.rpc("file_sante");
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setCanaux((data ?? []) as unknown as Canal[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return (
      <div className="rounded-2xl border border-border p-4 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </div>
    );
  }

  // Un refus n'est pas une panne : c'est la reponse a la question posee par
  // quelqu'un qui n'a pas le droit de la poser.
  if (erreur) return null;

  const sansPorteur = canaux.filter((c) => !c.porteur_actif);
  const bloques = canaux.reduce((n, c) => n + (c.porteur_actif ? 0 : c.en_attente), 0);

  return (
    <section className="rounded-2xl border border-border p-4">
      <h3 className="flex items-center gap-2 font-display text-base font-semibold">
        <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
        La file d'envoi
      </h3>

      {sansPorteur.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {sansPorteur.length} canal
            {sansPorteur.length > 1 ? "x" : ""} sans porteur (
            {sansPorteur.map((c) => NOM[c.canal] ?? c.canal).join(", ")}).
            {bloques > 0
              ? ` ${bloques} message${bloques > 1 ? "s" : ""} y attendent et ne partiront pas.`
              : " Un message déposé sur l'un d'eux y resterait."}
          </span>
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {canaux.map((c) => (
          <li
            key={c.canal}
            className={`rounded-xl border p-3 ${
              c.porteur_actif ? "border-border" : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {NOM[c.canal] ?? c.canal}
                {c.porteur_actif ? (
                  <CheckCircle2
                    className="ml-1.5 inline h-3.5 w-3.5 text-primary"
                    aria-label="porté"
                  />
                ) : (
                  <AlertTriangle
                    className="ml-1.5 inline h-3.5 w-3.5 text-destructive"
                    aria-label="sans porteur"
                  />
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {c.en_attente} en attente · {c.remis} remis
                {c.en_echec > 0 && ` · ${c.en_echec} en échec`}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.verdict}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default FileSanteCard;
