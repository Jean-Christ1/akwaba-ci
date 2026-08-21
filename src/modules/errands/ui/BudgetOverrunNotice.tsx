import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

interface BudgetOverrunNoticeProps {
  errandId: string;
  /** Budget annoncé par le client à la commande. */
  budgetEstimate: number;
  /** Total des achats réellement facturé par le shopper. */
  itemsTotal: number;
  /** Le lecteur est le client, seul habilité à donner son accord. */
  isCustomer: boolean;
  onApproved: () => void;
}

/**
 * Accord du client sur un dépassement du budget d'achat.
 *
 * Le serveur lève ce drapeau quand la facture s'écarte du budget annoncé
 * au delà de la tolérance du barème. Sans affichage, l'attente restait
 * invisible des deux côtés : le client ignorait qu'on attendait sa réponse, et
 * le shopper ne comprenait pas pourquoi sa course n'avançait plus. Chacun voit
 * désormais le même écart, et l'accord passe par la fonction serveur prévue,
 * seule habilitée à lever l'état.
 */
export function BudgetOverrunNotice({
  errandId,
  budgetEstimate,
  itemsTotal,
  isCustomer,
  onApproved,
}: BudgetOverrunNoticeProps) {
  const [busy, setBusy] = useState(false);
  const ecart = Math.max(0, itemsTotal - budgetEstimate);

  const approuver = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("errand_approve_budget_overrun", {
      p_errand_id: errandId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Dépassement approuvé.");
    onApproved();
  };

  return (
    <section className="rounded-2xl border border-accent/50 bg-accent/10 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-accent-foreground" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Dépassement du budget d'achat</h2>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Budget annoncé</dt>
          <dd>{formatFcfa(budgetEstimate)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Achats facturés</dt>
          <dd>{formatFcfa(itemsTotal)}</dd>
        </div>
        <div className="flex justify-between border-t border-accent/40 pt-1 font-semibold">
          <dt>Écart</dt>
          <dd>{formatFcfa(ecart)}</dd>
        </div>
      </dl>

      {isCustomer ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Le shopper a dépassé le budget que vous aviez annoncé. Vérifiez le reçu, puis donnez
            votre accord pour que la course puisse être réglée. Si l'écart vous semble injustifié,
            ouvrez un litige plutôt que d'approuver.
          </p>
          <Button className="mt-3 w-full" size="sm" disabled={busy} onClick={approuver}>
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            J'approuve ce dépassement
          </Button>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Votre facture dépasse le budget annoncé par le client. Son accord explicite est attendu
          avant le règlement. Expliquez-lui l'écart dans la conversation et joignez le reçu.
        </p>
      )}
    </section>
  );
}

export default BudgetOverrunNotice;
