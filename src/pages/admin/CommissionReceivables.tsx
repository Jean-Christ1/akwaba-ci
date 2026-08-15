import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

interface Creance {
  runner_id: string;
  full_name: string | null;
  phone: string | null;
  commission_due: number;
  commission_settled: number;
  lifetime_earnings: number;
  jobs_completed: number;
  derniere_commission: string | null;
}

/**
 * Commissions que la plateforme doit encaisser.
 *
 * Aucun agrégateur de paiement n'est branché : le client règle le shopper
 * directement, et le shopper doit ensuite sa commission à la plateforme. Sans
 * cet écran, cette créance n'existait nulle part dans l'interface, ce qui
 * revenait à ne jamais la réclamer.
 */
export function CommissionReceivables() {
  const [lignes, setLignes] = useState<Creance[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [montants, setMontants] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase
      .from("commission_receivables")
      .select("*")
      .order("commission_due", { ascending: false });
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setLignes((data ?? []) as Creance[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const encaisser = async (ligne: Creance) => {
    const saisi = Number(montants[ligne.runner_id] ?? ligne.commission_due);
    if (!Number.isFinite(saisi) || saisi <= 0) {
      toast.error("Indiquez le montant réellement reçu.");
      return;
    }
    setEnCours(ligne.runner_id);
    const { error } = await supabase.rpc("commission_settlement_record", {
      p_runner_id: ligne.runner_id,
      p_amount: saisi,
      p_reference: references[ligne.runner_id]?.trim() || undefined,
    });
    setEnCours(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Règlement de ${formatFcfa(saisi)} enregistré.`);
    setMontants((m) => ({ ...m, [ligne.runner_id]: "" }));
    setReferences((r) => ({ ...r, [ligne.runner_id]: "" }));
    void charger();
  };

  const total = lignes.reduce((n, l) => n + Number(l.commission_due), 0);

  if (chargement) {
    return <p className="text-sm text-muted-foreground">Chargement des créances…</p>;
  }

  if (erreur) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Les créances n'ont pas pu être chargées.</p>
        <p className="mt-1 text-muted-foreground">{erreur}</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Commissions à encaisser</h2>
          <p className="text-xs text-muted-foreground">
            Le client règle le shopper directement : la commission reste due à la plateforme.
          </p>
        </div>
        <p className="text-sm font-semibold">{formatFcfa(total)} au total</p>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune commission en attente de règlement.</p>
      ) : (
        <ul className="space-y-2">
          {lignes.map((l) => (
            <li key={l.runner_id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.full_name ?? "Shopper sans nom"}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.phone ?? "sans téléphone"} · {l.jobs_completed} mission
                    {l.jobs_completed > 1 ? "s" : ""} · {formatFcfa(l.lifetime_earnings)} encaissés
                  </p>
                  {l.commission_settled > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Déjà réglé : {formatFcfa(l.commission_settled)}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-right text-sm font-semibold text-destructive">
                  {formatFcfa(l.commission_due)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <label className="text-[11px] text-muted-foreground" htmlFor={`m-${l.runner_id}`}>
                    Montant reçu
                  </label>
                  <Input
                    id={`m-${l.runner_id}`}
                    inputMode="numeric"
                    placeholder={String(l.commission_due)}
                    value={montants[l.runner_id] ?? ""}
                    onChange={(e) =>
                      setMontants((m) => ({ ...m, [l.runner_id]: e.target.value }))
                    }
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="text-[11px] text-muted-foreground" htmlFor={`r-${l.runner_id}`}>
                    Référence du transfert
                  </label>
                  <Input
                    id={`r-${l.runner_id}`}
                    placeholder="Relevé, numéro d'opération"
                    value={references[l.runner_id] ?? ""}
                    onChange={(e) =>
                      setReferences((r) => ({ ...r, [l.runner_id]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  size="sm"
                  disabled={enCours === l.runner_id}
                  onClick={() => void encaisser(l)}
                >
                  {enCours === l.runner_id ? "Enregistrement…" : "Constater le règlement"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
