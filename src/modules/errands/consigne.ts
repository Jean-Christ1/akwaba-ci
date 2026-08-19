/**
 * La consigne de remplacement, et le quartier qui doit suivre la ville.
 *
 * Ces fonctions vivaient dans l'écran de demande. Un fichier qui exporte à la
 * fois un composant et des fonctions perd le rechargement à chaud de Vite, et
 * l'outil de compilation le signale à chaque passage.
 */

/** Consignes possibles lorsqu'un article manque en rayon. */
export type SubstitutionPolicy = "never" | "ask" | "similar";

/**
 * Les libellés des consignes sont écrits une seule fois : l'avertissement cite
 * la consigne choisie, et il doit citer exactement ce que le client a lu dans
 * la liste, faute de quoi il décrirait un choix que personne n'a fait.
 */
export const LIBELLES_CONSIGNE: Record<SubstitutionPolicy, string> = {
  ask: "Me demander avant de remplacer",
  similar: "Prendre un équivalent, à prix voisin",
  never: "Ne rien remplacer, laisser de côté",
};

/**
 * Quartier à conserver après un changement de ville.
 *
 * Le quartier restait dans l'état quand la ville changeait : une demande
 * partait en ville Bouaké avec le quartier Cocody Centre, absent du sélecteur
 * mais transmis tel quel dans p_zone. La course s'affichait « Cocody Centre,
 * Bouaké » et aucun shopper filtrant par quartier ne la voyait jamais.
 *
 * Le référentiel des quartiers vient de la base, il manque donc au premier
 * rendu : tant qu'il n'est pas chargé, on ne vide rien, sinon le quartier à
 * peine choisi disparaîtrait dans le cas normal.
 */
export function quartierApresChangementDeVille(
  quartier: string,
  quartiersDeLaVille: string[],
  referentielCharge: boolean
): string {
  if (!quartier) return "";
  if (!referentielCharge) return quartier;
  return quartiersDeLaVille.includes(quartier) ? quartier : "";
}

/**
 * Avertissement à donner lorsque la consigne de remplacement n'a pas pu être
 * posée après la création de la course.
 *
 * Le second appel serveur partait sans que son résultat soit regardé. Sur une
 * coupure réseau, courante depuis un téléphone, la course gardait la consigne
 * par défaut de la colonne, 'ask' (migration 20260815210000), pendant que le
 * client lisait un message de succès. L'écart n'apparaissait qu'au moment où
 * le shopper proposait un remplacement.
 *
 * La course, elle, existe : le message le dit d'abord, pour ne pas laisser
 * croire à un échec de publication.
 */
export function avertissementConsigne(
  policy: SubstitutionPolicy,
  echec: boolean
): string | null {
  if (!echec) return null;
  // La course porte déjà cette consigne par défaut : avertir ici alarmerait le
  // client pour un écart qui n'existe pas.
  if (policy === "ask") return null;
  return (
    "Demande publiée. En revanche, votre consigne « " +
    LIBELLES_CONSIGNE[policy] +
    " » n'a pas été enregistrée : la course reste sur « " +
    LIBELLES_CONSIGNE.ask +
    " ». Le shopper vous consultera donc avant tout remplacement."
  );
}
