import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

/** Ce que la personne doit écrire pour confirmer. Un clic seul ne suffit pas. */
export const MOT_DE_CONFIRMATION = "SUPPRIMER";

/**
 * Décide si la suppression peut partir.
 *
 * Le mot est comparé sans distinction de casse ni d'espaces : on ne piège pas
 * quelqu'un sur une majuscule, on s'assure qu'il a lu et voulu.
 */
export function confirmationValide(saisie: string): boolean {
  return saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION;
}

interface DeleteAccountCardProps {
  onDeleted: () => void;
}

/**
 * Supprimer son compte.
 *
 * La page de confidentialité promet au visiteur qu'il peut demander l'accès à
 * ses données, leur rectification et leur suppression. Aucun écran ne le
 * permettait, et l'adresse de contact censée recueillir la demande est encore
 * un marqueur à compléter : le droit était annoncé sans aucun moyen de
 * l'exercer.
 *
 * Le serveur refuse tant qu'une course, une commission, un solde ou un retrait
 * reste en suspens, et dit lequel. Ces messages sont rendus tels quels : ils
 * nomment précisément ce qui bloque, et c'est ce dont la personne a besoin.
 */
export function DeleteAccountCard({ onDeleted }: DeleteAccountCardProps) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [busy, setBusy] = useState(false);

  const supprimer = async () => {
    if (!confirmationValide(saisie)) return;

    setBusy(true);
    const { error } = await supabase.rpc("account_delete_self");
    setBusy(false);

    if (error) return toast.error(error.message);

    await supabase.auth.signOut();
    toast.success("Votre compte a été supprimé.");
    onDeleted();
  };

  return (
    <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold text-destructive">
          Supprimer mon compte
        </h2>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Votre profil, votre dossier de shopper, vos comptes de réception, votre portefeuille, vos
        favoris et vos messages sont effacés. Vos courses terminées restent dans nos comptes, sans
        votre nom, parce que la loi nous impose de conserver ces écritures.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Cette action ne se reprend pas.</p>

      {!ouvert ? (
        <Button
          variant="outline"
          className="mt-3 min-h-[44px] border-destructive/40 text-destructive"
          onClick={() => setOuvert(true)}
        >
          Supprimer mon compte
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <Label className="text-xs" htmlFor="confirmation-suppression">
            Écrivez {MOT_DE_CONFIRMATION} pour confirmer
          </Label>
          <Input
            id="confirmation-suppression"
            className="mt-1 min-h-[44px]"
            value={saisie}
            autoComplete="off"
            onChange={(e) => setSaisie(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              className="min-h-[44px]"
              disabled={busy || !confirmationValide(saisie)}
              onClick={() => void supprimer()}
            >
              Supprimer définitivement
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setOuvert(false);
                setSaisie("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default DeleteAccountCard;
