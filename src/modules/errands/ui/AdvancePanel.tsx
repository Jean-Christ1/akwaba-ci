import { useCallback, useEffect, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";
import { MOMO_PROVIDERS } from "@/modules/errands/pricing";

interface CompteReception {
  provider: string;
  account_number: string;
  account_name: string;
}

interface AdvancePanelProps {
  errandId: string;
  budgetEstimate: number;
  advanceAmount: number;
  advanceConfirmed: boolean;
  onDeclared: () => void;
}

/**
 * Envoi du budget d'achat.
 *
 * Le mode de financement recommandé demande au client de transférer le budget
 * au shopper avant son départ. Encore faut-il savoir sur quel compte : cette
 * information n'était affichée nulle part, ce qui obligeait à la réclamer par
 * la messagerie et rendait la promesse produit intenable.
 */
export function AdvancePanel({
  errandId,
  budgetEstimate,
  advanceAmount,
  advanceConfirmed,
  onDeclared,
}: AdvancePanelProps) {
  const [compte, setCompte] = useState<CompteReception | null>(null);
  const [montant, setMontant] = useState(String(budgetEstimate || ""));
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase.rpc("errand_runner_payout_account", {
      p_errand_id: errandId,
    });
    const lignes = (data ?? []) as CompteReception[];
    setCompte(lignes[0] ?? null);
  }, [errandId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const copier = async (valeur: string) => {
    try {
      await navigator.clipboard.writeText(valeur);
      toast.success("Numéro copié.");
    } catch {
      toast.error("Copie impossible sur cet appareil.");
    }
  };

  const declarer = async () => {
    const valeur = Number(montant) || 0;
    if (valeur <= 0) return toast.error("Indiquez le montant que vous avez envoyé.");

    setBusy(true);
    const { error } = await supabase.rpc("errand_declare_advance", {
      p_errand_id: errandId,
      p_amount: valeur,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Avance enregistrée.");
    onDeclared();
  };

  const libelleFournisseur =
    MOMO_PROVIDERS.find((p) => p.value === compte?.provider)?.label ?? compte?.provider;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Budget d'achat</h2>
      </div>

      {advanceConfirmed ? (
        <p className="mt-2 text-sm">
          Vous avez déclaré un envoi de{" "}
          <span className="font-semibold">{formatFcfa(advanceAmount)}</span>. La régularisation se
          fera au franc près sur présentation du reçu.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Transférez le budget des achats au shopper avant qu'il ne parte, puis indiquez le
            montant envoyé. La différence sera régularisée avec le reçu.
          </p>

          {compte ? (
            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Compte de réception du shopper</p>
              <p className="mt-1 font-display text-lg font-semibold">{compte.account_number}</p>
              <p className="text-xs text-muted-foreground">
                {libelleFournisseur} · {compte.account_name}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copier(compte.account_number)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Copier le numéro
              </Button>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              Le shopper n'a pas encore renseigné de compte de réception. Demandez-le lui dans la
              conversation avant d'envoyer quoi que ce soit.
            </p>
          )}

          <div className="mt-3">
            <Label className="text-xs" htmlFor="avance">
              Montant envoyé
            </Label>
            <Input
              id="avance"
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))}
              className="mt-1"
            />
          </div>

          <Button className="mt-2 w-full" size="sm" disabled={busy} onClick={declarer}>
            J'ai envoyé l'argent
          </Button>
        </>
      )}
    </section>
  );
}

export default AdvancePanel;
