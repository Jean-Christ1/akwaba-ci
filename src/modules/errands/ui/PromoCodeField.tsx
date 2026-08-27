import { useState } from "react";
import { BadgePercent, Check, Loader2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

export interface EvaluationPromo {
  valide: boolean;
  code?: string;
  libelle?: string;
  remise: number;
  motif: string | null;
}

/**
 * Met un code sous la forme que la base accepte.
 *
 * La contrainte n'accepte que des majuscules, des chiffres et des tirets.
 * Quelqu'un qui tape son code en minuscules, ou avec un espace collé au
 * copier-coller, doit voir son code marcher, pas un refus.
 */
export function normaliserCode(saisie: string): string {
  return saisie.trim().toUpperCase().replace(/\s+/g, "");
}

interface PromoCodeFieldProps {
  /** Ville de la course, telle qu'elle sera enregistrée. */
  ville: string;
  /** Frais de service du devis en cours. */
  fraisService: number;
  /** Commission brute correspondante : c'est elle qui plafonne la remise. */
  commission: number;
  onChange: (code: string, evaluation: EvaluationPromo | null) => void;
}

/**
 * Saisie d'un code promotionnel.
 *
 * Le code est évalué avant la commande, pas après : découvrir au moment de
 * payer que son code ne marchait pas est la meilleure façon de perdre
 * quelqu'un. Le refus dit toujours pourquoi, parce qu'un « code invalide »
 * envoie au support pour une réponse qu'on avait sous la main.
 *
 * La remise sort de la commission d'Akwaba, jamais du gain du shopper. C'est
 * pour cela qu'elle peut être plus faible que la valeur annoncée du code :
 * l'écran le dit plutôt que de laisser croire à une erreur.
 */
export function PromoCodeField({
  ville,
  fraisService,
  commission,
  onChange,
}: PromoCodeFieldProps) {
  const [code, setCode] = useState("");
  const [evaluation, setEvaluation] = useState<EvaluationPromo | null>(null);
  const [busy, setBusy] = useState(false);

  const verifier = async (saisie: string) => {
    const normalise = normaliserCode(saisie);
    setCode(normalise);

    if (normalise.length < 3) {
      setEvaluation(null);
      onChange("", null);
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("promo_evaluer", {
      p_code: normalise,
      p_user_id: undefined,
      p_ville: ville,
      p_frais: fraisService,
      p_commission: commission,
    });
    setBusy(false);

    if (error) {
      const echec = { valide: false, remise: 0, motif: error.message };
      setEvaluation(echec);
      onChange("", null);
      return;
    }

    const lue = data as unknown as EvaluationPromo;
    setEvaluation(lue);
    onChange(lue?.valide ? normalise : "", lue?.valide ? lue : null);
  };

  return (
    <div>
      <Label className="flex items-center gap-1.5 text-xs" htmlFor="code-promo">
        <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
        Code promotionnel
      </Label>
      <Input
        id="code-promo"
        className="mt-1 min-h-[44px] font-mono uppercase"
        placeholder="PREMIERE-COURSE"
        autoComplete="off"
        value={code}
        onChange={(e) => void verifier(e.target.value)}
      />

      {busy && <p className="mt-1 text-[11px] text-muted-foreground">Vérification…</p>}

      {!busy && evaluation?.valide && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-primary">
          <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {evaluation.libelle} : {formatFcfa(evaluation.remise)} de moins sur vos frais de
            service.
          </span>
        </p>
      )}

      {!busy && evaluation && !evaluation.valide && evaluation.motif !== "aucun code" && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-destructive">
          <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{evaluation.motif}</span>
        </p>
      )}

      {busy && <Loader2 className="sr-only h-3 w-3 animate-spin" aria-hidden="true" />}
    </div>
  );
}

export default PromoCodeField;
