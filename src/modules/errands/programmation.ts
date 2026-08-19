/**
 * Le vocabulaire des courses programmées.
 *
 * Il vivait dans la carte de programmation, recopié de la page des courses
 * programmées faute de module commun, avec le commentaire qui le disait. Les
 * deux écrans décrivent pourtant le même enregistrement : deux formulations
 * différentes pour un même rythme feraient douter le client d'avoir programmé
 * ce qu'il croit. Ils lisent désormais la même source.
 *
 * Le sortir de la carte a un second effet : un fichier qui exporte à la fois un
 * composant et des fonctions perd le rechargement à chaud de Vite.
 */

export type ScheduleRhythm = "weekly" | "biweekly" | "monthly";

/**
 * Les jours de la semaine, dans l'ordre attendu par la base : dimanche vaut 0,
 * comme EXTRACT(DOW).
 */
export const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export const RYTHMES: { value: ScheduleRhythm; label: string }[] = [
  { value: "weekly", label: "Chaque semaine" },
  { value: "biweekly", label: "Une semaine sur deux" },
  { value: "monthly", label: "Chaque mois" },
];

/**
 * Le jour du mois s'arrête à 28, exactement comme la contrainte de la table :
 * un rendez-vous fixé au 31 sauterait les mois courts sans que personne ne
 * comprenne pourquoi sa course n'est pas partie.
 */
export const JOURS_DU_MOIS = Array.from({ length: 28 }, (_, i) => i + 1);

export const HEURES = Array.from({ length: 24 }, (_, i) => i);

/** Bornes du libellé, reprises de la contrainte errand_schedules_label_len. */
export const LIBELLE_MIN = 2;
export const LIBELLE_MAX = 80;

/**
 * Formulation en français naturel du rythme choisi.
 *
 * La carte de programmation et la page des courses programmées l'emploient
 * toutes les deux : le client doit relire, dans sa liste, la phrase exacte
 * qu'il a validée au moment de programmer.
 */
export function decrireRythme(
  rythme: ScheduleRhythm,
  jourSemaine: number,
  jourMois: number,
  heure: number
): string {
  const heureLue = `${String(heure).padStart(2, "0")} h`;
  if (rythme === "monthly") return `Le ${jourMois} de chaque mois, vers ${heureLue}`;
  const jour = JOURS[jourSemaine] ?? JOURS[0];
  return rythme === "weekly"
    ? `Chaque ${jour}, vers ${heureLue}`
    : `Un ${jour} sur deux, vers ${heureLue}`;
}
