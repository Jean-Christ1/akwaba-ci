import { useState } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PAY_METHODS } from "@/modules/errands/domain";
import { AdvancePanel } from "@/modules/errands/ui/AdvancePanel";
import { AdvanceReceiptCard } from "@/modules/errands/ui/AdvanceReceiptCard";
import { ProofUpload } from "@/modules/errands/ui/ProofUpload";
import type { ErrandDetail } from "@/modules/errands/application/useErrandDetail";

interface ErrandPaymentPanelProps {
  errand: ErrandDetail;
  isRunner: boolean;
  isCustomer: boolean;
  onChanged: () => void;
}

/**
 * Règlement d'une course.
 *
 * Rassemble l'envoi du budget d'achat avant le départ du shopper, les preuves
 * de transfert, et la confirmation finale du paiement. Tant que le client n'a
 * pas donné son accord sur un dépassement de budget, la confirmation reste
 * fermée : régler d'abord et découvrir l'écart ensuite reviendrait à valider un
 * montant qu'on n'a pas accepté.
 */
export function ErrandPaymentPanel({
  errand,
  isCustomer,
  isRunner,
  onChanged,
}: ErrandPaymentPanelProps) {
  const [busy, setBusy] = useState(false);

  const confirmer = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("errand_confirm_payment", { p_errand_id: errand.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Course terminée. Merci !");
    onChanged();
  };

  const regle = errand.payment_status === "paid";
  const attenteAccord = errand.budget_overrun_pending;
  const peutConfirmer = isCustomer && !regle && errand.status === "delivered";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Règlement</h2>
      </div>

      {/* Le client voit sur quel compte envoyer le budget, déclare le montant
          transféré, puis dépose sa preuve. */}
      {isCustomer && errand.fund_mode === "customer_advance" && !regle && (
        <div className="mt-3 space-y-3">
          <AdvancePanel
            declaredAmount={Number(errand.advance_declared_amount) || 0}
            confirmedAmount={Number(errand.advance_amount) || 0}
            declaredAt={errand.advance_declared_at}
            confirmedAt={errand.advance_confirmed_at}
            errandId={errand.id}
            budgetEstimate={Number(errand.budget_estimate) || 0}
            onDeclared={onChanged}
          />
          <ProofUpload
            errandId={errand.id}
            kind="advance"
            existingPath={errand.advance_proof_url}
            amount={
              Number(errand.advance_declared_amount) ||
              Number(errand.advance_amount) ||
              Number(errand.budget_estimate) ||
              0
            }
            onUploaded={onChanged}
          />
        </div>
      )}

      {/* Le shopper reconnaît ce qu'il a effectivement reçu. Sans cette
          confirmation, le montant reconnu reste à zéro et la facture du
          client ne déduit rien de ce qu'il a déjà versé. */}
      {isRunner && errand.fund_mode === "customer_advance" && !regle && (
        <div className="mt-3">
          <AdvanceReceiptCard
            errandId={errand.id}
            declaredAmount={Number(errand.advance_declared_amount) || 0}
            declaredAt={errand.advance_declared_at}
            confirmedAmount={Number(errand.advance_amount) || 0}
            confirmedAt={errand.advance_confirmed_at}
            onConfirmed={onChanged}
          />
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Paiement : {PAY_METHODS.find((p) => p.value === errand.payment_method)?.label} ·{" "}
        {regle ? "Réglé" : "En attente"}
      </p>

      {peutConfirmer && (
        <>
          <Button className="mt-3 w-full" disabled={busy || attenteAccord} onClick={confirmer}>
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Confirmer le paiement
          </Button>
          {attenteAccord && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Donnez d'abord votre accord sur le dépassement de budget, plus haut sur cette page.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default ErrandPaymentPanel;
