import { useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

interface AdvanceReceiptCardProps {
  errandId: string;
  /** Ce que le client dit avoir envoyé. */
  declaredAmount: number;
  declaredAt: string | null;
  confirmedAmount: number;
  confirmedAt: string | null;
  onConfirmed: () => void;
}

/**
 * Confirmation de l'avance, côté shopper.
 *
 * Le client déclare ce qu'il a envoyé, mais une déclaration ne prouve rien :
 * seul celui qui reçoit sait ce qui est arrivé sur son compte. La fonction
 * serveur qui inscrit le montant reçu existait depuis l'origine et n'était
 * appelée par aucun écran. Conséquence : le montant reconnu restait à zéro,
 * la facture ne déduisait rien, et le client se voyait redemander une somme
 * qu'il avait déjà versée.
 *
 * Le montant du client est proposé par défaut, et reste modifiable : ce qui
 * compte est ce qui a été reçu, pas ce qui a été annoncé.
 */
export function AdvanceReceiptCard({
  errandId,
  declaredAmount,
  declaredAt,
  confirmedAmount,
  confirmedAt,
  onConfirmed,
}: AdvanceReceiptCardProps) {
  const [montant, setMontant] = useState(String(declaredAmount || ""));
  const [busy, setBusy] = useState(false);

  const confirmer = async () => {
    const valeur = Number(montant) || 0;
    if (valeur <= 0) return toast.error("Indiquez le montant réellement reçu.");

    setBusy(true);
    const { error } = await supabase.rpc("errand_confirm_advance", {
      p_errand_id: errandId,
      p_amount: valeur,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Réception confirmée. Le montant est déduit de la facture du client.");
    onConfirmed();
  };

  if (confirmedAt) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">Avance du client</h2>
        </div>
        <p className="mt-2 text-sm">
          Vous avez confirmé avoir reçu{" "}
          <span className="font-semibold">{formatFcfa(confirmedAmount)}</span>. Ce montant est déduit
          de la facture du client.
        </p>
      </section>
    );
  }

  if (!declaredAt) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">Avance du client</h2>
        </div>
        {/* Rien à confirmer tant que rien n'est annoncé : afficher un champ de
            saisie ici inviterait à reconnaître une somme jamais reçue. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Le client n'a pas encore déclaré d'envoi. Rien n'est à confirmer pour l'instant.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Avance du client</h2>
      </div>

      <p className="mt-2 text-sm">
        Le client déclare avoir envoyé{" "}
        <span className="font-semibold">{formatFcfa(declaredAmount)}</span>.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Vérifiez sur votre compte, puis confirmez le montant réellement reçu. C'est celui-ci, et lui
        seul, qui est déduit de la facture du client.
      </p>

      <div className="mt-3">
        <Label className="text-xs" htmlFor="avance-recue">
          Montant reçu
        </Label>
        <Input
          id="avance-recue"
          inputMode="numeric"
          value={montant}
          onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))}
          className="mt-1"
        />
      </div>

      <Button className="mt-2 min-h-[44px] w-full" size="sm" disabled={busy} onClick={confirmer}>
        Je confirme avoir reçu ce montant
      </Button>
    </section>
  );
}

export default AdvanceReceiptCard;
