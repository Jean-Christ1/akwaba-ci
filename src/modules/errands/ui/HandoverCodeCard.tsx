import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface HandoverCodeCardProps {
  errandId: string;
}

/**
 * Code de remise, côté client.
 *
 * Ce code est le seul secret de la course : il n'est jamais envoyé avec le
 * reste des colonnes, sans quoi le shopper pourrait clôturer la mission sans
 * avoir rencontré personne. Le client le demande explicitement, et la fonction
 * serveur vérifie son identité avant de le rendre.
 */
export function HandoverCodeCard({ errandId }: HandoverCodeCardProps) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const afficher = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("errand_handover_code", {
      p_errand_id: errandId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data) return toast.error("Aucun code de remise pour cette course.");
    setCode(data as string);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Code de remise</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Communiquez ce code au shopper seulement quand vous avez reçu votre commande. Il en a
        besoin pour clôturer la mission.
      </p>
      {code ? (
        <p className="mt-3 text-center font-display text-3xl font-semibold tracking-[0.3em]">
          {code}
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          disabled={busy}
          onClick={afficher}
        >
          Afficher mon code
        </Button>
      )}
    </section>
  );
}

export default HandoverCodeCard;
