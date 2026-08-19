import { useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

interface TipCardProps {
  errandId: string;
  /** Pourboire déjà inscrit sur la course, en FCFA. */
  currentTip: number;
  /** Statut de règlement de la course, tel que le serveur le connaît. */
  paymentStatus: string;
  onAdded: () => void;
}

/**
 * Pourboire laissé par le client.
 *
 * Le pourboire était promis sur les écrans du produit, la fonction
 * errand_add_tip existait en base et était ouverte au client, mais aucun écran
 * ne l'appelait : tip_amount restait donc à zéro sur toutes les courses, et le
 * shopper ne recevait jamais rien de ce qui lui était annoncé.
 *
 * Les deux gardes de la fonction se retrouvent ici : elle refuse un autre
 * demandeur que le client de la course (42501), et refuse une course déjà
 * réglée (22023). La seconde impose la place de ce contrôle dans le parcours :
 * le pourboire se saisit avant la confirmation du paiement, jamais après.
 */
export function TipCard({ errandId, currentTip, paymentStatus, onAdded }: TipCardProps) {
  const [montant, setMontant] = useState("");
  const [busy, setBusy] = useState(false);

  // Après le règlement, la fonction lève une exception. Laisser le champ à
  // l'écran promettrait un geste que le serveur refusera.
  if (paymentStatus === "paid") return null;

  const enregistrer = async () => {
    const valeur = Number(montant);
    if (!montant || !Number.isFinite(valeur) || valeur <= 0) {
      return toast.error("Indiquez le montant que vous souhaitez laisser au shopper.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("errand_add_tip", {
      p_errand_id: errandId,
      p_amount: valeur,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    setMontant("");
    toast.success("Pourboire enregistré. Il revient en entier à votre shopper.");
    onAdded();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Pourboire</h2>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Le pourboire revient en entier au shopper : la commission ne s'applique pas dessus.
      </p>

      {currentTip > 0 && (
        // La fonction serveur inscrit le montant reçu à la place du précédent,
        // elle ne l'ajoute pas. Le dire évite au client de doubler son geste en
        // croyant le compléter.
        <p className="mt-2 text-sm">
          Pourboire actuel : <span className="font-semibold">{formatFcfa(currentTip)}</span>. Un
          nouveau montant remplace celui-ci.
        </p>
      )}

      <div className="mt-3">
        <Label className="text-xs" htmlFor="pourboire">
          Montant du pourboire
        </Label>
        <Input
          id="pourboire"
          inputMode="numeric"
          value={montant}
          className="mt-1"
          onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      <Button
        size="sm"
        className="mt-2 min-h-[44px] w-full"
        disabled={busy}
        onClick={() => void enregistrer()}
      >
        Laisser un pourboire
      </Button>

      <p className="mt-2 text-[11px] text-muted-foreground">
        À décider avant de confirmer le paiement : une fois la course réglée, le montant ne peut
        plus changer.
      </p>
    </section>
  );
}

export default TipCard;
