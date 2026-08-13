import { useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { computeInvoice, formatFcfa } from "@/modules/errands/domain";
import { ProofUpload } from "@/modules/errands/ui/ProofUpload";
import type { ErrandDetail } from "@/modules/errands/application/useErrandDetail";

interface ErrandInvoiceProps {
  errand: ErrandDetail;
  isCustomer: boolean;
  isRunner: boolean;
  onSaved: () => void;
}

/**
 * Facture d'une course.
 *
 * Le shopper déclare ce qu'il a réellement dépensé et ce qu'il a avancé de sa
 * poche pour la livraison. Il ne déclare pas ses frais de service : ceux-ci
 * sortent du barème de la plateforme, sont fixés à l'acceptation de l'offre et
 * ne sont modifiables par personne. Les laisser saisissables affichait un total
 * que le serveur n'enregistrait jamais.
 */
export function ErrandInvoice({ errand, isCustomer, isRunner, onSaved }: ErrandInvoiceProps) {
  const [itemsTotal, setItemsTotal] = useState(String(errand.items_total || ""));
  const [deliveryFee, setDeliveryFee] = useState(String(errand.delivery_fee || ""));
  const [busy, setBusy] = useState(false);

  // La facture peut être réécrite par le serveur, par exemple au dépôt d'un
  // reçu : la saisie suit la valeur enregistrée plutôt que de la contredire.
  useEffect(() => {
    setItemsTotal(String(errand.items_total || ""));
    setDeliveryFee(String(errand.delivery_fee || ""));
  }, [errand.items_total, errand.delivery_fee]);

  const facture = useMemo(
    () =>
      computeInvoice({
        itemsTotal: Number(itemsTotal) || 0,
        serviceFee: Number(errand.service_fee) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        commissionRate: errand.commission_rate ?? 0.1,
      }),
    [itemsTotal, deliveryFee, errand.service_fee, errand.commission_rate]
  );

  const avance = Number(errand.advance_amount) || 0;
  const saisieOuverte = isRunner && errand.status !== "completed";

  const enregistrer = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("errand_save_invoice", {
      p_errand_id: errand.id,
      p_items_total: Number(itemsTotal) || 0,
      p_delivery_fee: Number(deliveryFee) || 0,
      p_tip_amount: 0,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Facture enregistrée");
    onSaved();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Facturation</h2>
      </div>

      {saisieOuverte && (
        <div className="mt-3 space-y-2">
          <div>
            <Label className="text-xs" htmlFor="achats">Total des achats</Label>
            <Input
              id="achats"
              value={itemsTotal}
              inputMode="numeric"
              onChange={(e) => setItemsTotal(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="livraison">Frais de livraison</Label>
            <Input
              id="livraison"
              value={deliveryFee}
              inputMode="numeric"
              onChange={(e) => setDeliveryFee(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="flex justify-between text-sm">
              <span className="text-muted-foreground">Frais de service</span>
              <strong>{formatFcfa(errand.service_fee)}</strong>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Montant fixé par la plateforme d'après le barème en vigueur et l'offre acceptée. Il
              n'est modifiable ni par vous ni par le client.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={enregistrer}
          >
            Enregistrer la facture
          </Button>
          <ProofUpload
            errandId={errand.id}
            kind="receipt"
            existingPath={errand.receipt_url}
            amount={Number(itemsTotal) || 0}
            onUploaded={onSaved}
          />
        </div>
      )}

      {/* Le reçu déposé par le shopper reste consultable par le client. */}
      {isCustomer && errand.receipt_url && (
        <div className="mt-3">
          <ProofUpload
            errandId={errand.id}
            kind="receipt"
            existingPath={errand.receipt_url}
            onUploaded={onSaved}
          />
        </div>
      )}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Achats</dt>
          <dd>{formatFcfa(facture.items)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Service</dt>
          <dd>{formatFcfa(facture.service)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Livraison</dt>
          <dd>{formatFcfa(facture.delivery)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>Total à payer</dt>
          <dd>{formatFcfa(facture.total)}</dd>
        </div>
        {/* Une avance déjà envoyée doit se déduire à l'écran : sans cela, le
            client ne sait pas ce qu'il lui reste réellement à régler. */}
        {avance > 0 && (
          <>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Avance déjà envoyée</dt>
              <dd>- {formatFcfa(avance)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-primary">
              <dt>Reste à régler</dt>
              <dd>{formatFcfa(Math.max(facture.total - avance, 0))}</dd>
            </div>
          </>
        )}
        {isRunner && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>Votre gain (après {Math.round(facture.commissionRate * 100)}% Akwaba)</dt>
            <dd>{formatFcfa(facture.runnerPayout)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export default ErrandInvoice;
