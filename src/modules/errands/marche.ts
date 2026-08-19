/**
 * Ce qu'un shopper peut voir du marché, et ce qu'une offre doit valoir.
 *
 * Ces fonctions vivaient dans l'écran du marché. Un fichier qui exporte à la
 * fois un composant et des fonctions perd le rechargement à chaud de Vite, et
 * l'outil de compilation le signale à chaque passage.
 */
import { formatFcfa } from "@/modules/errands/domain";

export interface AccesShopper {
  /** Le marché ouvert n'est publié qu'au shopper validé : la vue refuse les autres. */
  marcheOuvert: boolean;
  /** Les missions déjà attribuées, dues au client quel que soit l'état du compte. */
  mesMissions: boolean;
  /** Invitation à candidater, pour qui n'a pas encore de dossier de shopper. */
  candidature: boolean;
  /** Ce qu'il faut dire au shopper sur l'état de son dossier, ou rien. */
  bandeau: string | null;
}

const BANDEAUX: Record<string, string> = {
  pending:
    "Votre candidature de shopper est en cours d'examen. Le marché ouvert s'affichera dès sa validation.",
  suspended:
    "Votre compte shopper est suspendu : vous ne recevez plus de nouvelles missions. " +
    "Terminez celles que vous avez déjà acceptées, le client attend sa livraison.",
  rejected:
    "Votre candidature de shopper n'a pas été retenue. Vous ne recevez plus de nouvelles missions ; " +
    "terminez celles qui vous ont été confiées.",
};

const BANDEAU_PAR_DEFAUT =
  "Votre compte shopper n'est pas actif : le marché ouvert ne vous est plus proposé. " +
  "Les missions déjà acceptées restent accessibles.";

/**
 * Ce qu'un shopper voit selon l'état de son dossier.
 *
 * L'écran abandonnait ses deux requêtes dès que le statut n'était plus
 * « approved ». Un shopper suspendu perdait donc l'accès aux missions qu'il
 * avait déjà acceptées, alors que le serveur l'autorise toujours à les faire
 * avancer (errand_advance_status ne contrôle que le shopper assigné) et qu'un
 * client attend sa livraison au bout. Seule la lecture du marché ouvert doit
 * dépendre de la validation.
 *
 * `undefined` : le dossier n'a pas encore été lu, on ne conclut rien.
 * `null` : aucun dossier, l'invitation à candidater est la seule réponse utile.
 */
export function accesShopper(statut: string | null | undefined): AccesShopper {
  if (statut === undefined) {
    return { marcheOuvert: false, mesMissions: false, candidature: false, bandeau: null };
  }
  if (statut === null) {
    return { marcheOuvert: false, mesMissions: false, candidature: true, bandeau: null };
  }
  if (statut === "approved") {
    return { marcheOuvert: true, mesMissions: true, candidature: false, bandeau: null };
  }
  return {
    marcheOuvert: false,
    mesMissions: true,
    candidature: false,
    bandeau: BANDEAUX[statut] ?? BANDEAU_PAR_DEFAUT,
  };
}

/**
 * Refus d'une offre dont le prix ne tient pas debout.
 *
 * Le champ acceptait le vide : `Number("") || 0` valait zéro et l'insertion
 * passait. Le client lisait « 0 FCFA », acceptait, et le serveur lui facturait
 * le plancher du barème, GREATEST(prix, min_service_fee) dans
 * errand_accept_offer. Le prix affiché n'était donc pas celui appliqué.
 */
export function messageOffreInvalide(prix: string, plancher: number): string | null {
  const valeur = Number(prix);
  if (!prix.trim() || !Number.isFinite(valeur) || valeur <= 0) {
    return `Indiquez votre prix de service, au minimum ${formatFcfa(plancher)}.`;
  }
  if (valeur < plancher) {
    return `Votre prix ne peut pas descendre sous ${formatFcfa(plancher)} : c'est le montant que le client paiera de toute façon.`;
  }
  return null;
}
