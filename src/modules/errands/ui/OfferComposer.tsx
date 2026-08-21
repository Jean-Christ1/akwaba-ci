import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { messageOffreInvalide } from "@/modules/errands/marche";

interface OfferComposerProps {
  ouvert: boolean;
  onFermer: () => void;
  prix: string;
  setPrix: (v: string) => void;
  delai: string;
  setDelai: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  /** Plancher du barème en vigueur, en dessous duquel le serveur relève le prix. */
  plancher: number;
  /** Vrai tant que le barème n'est pas lu : on n'autorise pas avant de savoir. */
  baremeEnCours?: boolean;
  envoiEnCours: boolean;
  onEnvoyer: () => void;
}

/**
 * Le composeur d'une offre de shopper.
 *
 * Il vivait dans le corps de l'écran du marché, donc la garde de prix ne
 * pouvait s'éprouver qu'en cherchant une chaîne de caractères dans le fichier
 * source. Une relecture adverse l'a montré : en retirant le refus d'envoi et la
 * désactivation du bouton, aucun contrôle ne rougissait. Une garde qui ne peut
 * pas échouer ne garde rien.
 *
 * Ce que la garde protège : le champ n'était contrôlé ni à la saisie ni à
 * l'envoi, une offre partait donc à zéro, le client lisait « 0 FCFA », et le
 * serveur retenait ensuite le plancher du barème. Le client se voyait facturer
 * des frais de service pour une offre présentée comme gratuite.
 */
export function OfferComposer({
  ouvert,
  onFermer,
  prix,
  setPrix,
  delai,
  setDelai,
  message,
  setMessage,
  plancher,
  baremeEnCours = false,
  envoiEnCours,
  onEnvoyer,
}: OfferComposerProps) {
  const invalide = baremeEnCours
    ? "Barème en cours de chargement, un instant."
    : messageOffreInvalide(prix, plancher);

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proposer une offre</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="offre-prix">Votre prix de service (FCFA)</Label>
            <Input
              id="offre-prix"
              className="mt-1 min-h-[44px]"
              value={prix}
              inputMode="numeric"
              aria-invalid={Boolean(invalide) && prix.trim().length > 0}
              onChange={(e) => setPrix(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="3000"
            />
            {invalide && (
              <p
                role={prix.trim() ? "alert" : undefined}
                className={`mt-1 text-xs ${prix.trim() ? "text-destructive" : "text-muted-foreground"}`}
              >
                {invalide}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="offre-delai">Délai estimé (minutes)</Label>
            <Input
              id="offre-delai"
              className="mt-1 min-h-[44px]"
              value={delai}
              inputMode="numeric"
              onChange={(e) => setDelai(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div>
            <Label htmlFor="offre-message">Message</Label>
            <Textarea
              id="offre-message"
              className="mt-1"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Je suis à Cocody, je peux partir tout de suite."
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="min-h-[44px]"
            onClick={onEnvoyer}
            disabled={envoiEnCours || Boolean(invalide)}
          >
            {envoiEnCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OfferComposer;
