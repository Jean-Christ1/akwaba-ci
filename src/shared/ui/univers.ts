export type Univers = "courses" | "decouverte";

const CLE = "akwaba.univers";

/**
 * Le choix d'univers survit à la visite.
 *
 * Rebasculer à chaque retour serait pénible pour qui vient toujours pour la
 * même chose : un client régulier des courses n'a pas à rechoisir son univers
 * chaque matin.
 */
export function lireUnivers(): Univers {
  if (typeof window === "undefined") return "courses";
  try {
    return window.localStorage.getItem(CLE) === "decouverte" ? "decouverte" : "courses";
  } catch {
    // Stockage refusé, navigation privée : le service principal reste le défaut.
    return "courses";
  }
}

export function ecrireUnivers(u: Univers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLE, u);
  } catch {
    // Sans persistance, la bascule fonctionne le temps de la visite.
  }
}
