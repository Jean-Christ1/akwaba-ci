/**
 * Nouvelle tentative sur défaillance réseau.
 *
 * Sur les réseaux mobiles ivoiriens, une requête échoue régulièrement pour une
 * micro-coupure, non parce que le serveur refuse. Réessayer une ou deux fois
 * transforme un écran d'erreur en simple demi-seconde d'attente.
 *
 * Deux règles de prudence :
 *   - on ne réessaie jamais une écriture, qui pourrait s'appliquer deux fois ;
 *   - on ne réessaie pas un refus du serveur, qui se répéterait à l'identique.
 */

interface Options {
  /** Nombre de tentatives supplémentaires après la première. */
  tentatives?: number;
  /** Attente initiale en millisecondes, doublée à chaque essai. */
  attenteInitiale?: number;
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Détermine si une erreur mérite une nouvelle tentative.
 *
 * Un refus d'autorisation, une violation de contrainte ou une donnée invalide
 * se reproduiront à l'identique : insister n'apporterait qu'un délai.
 */
function estTemporaire(erreur: unknown): boolean {
  if (!erreur) return false;

  const e = erreur as { code?: string; message?: string; status?: number };
  const code = String(e.code ?? "");
  const message = String(e.message ?? "").toLowerCase();
  const status = Number(e.status ?? 0);

  // Les codes PostgreSQL de classe 42 (droits, syntaxe) et 23 (contraintes)
  // sont définitifs.
  if (/^(42|23|22)/.test(code)) return false;
  if (status === 401 || status === 403 || status === 404 || status === 422) return false;

  return (
    status === 0 ||
    status >= 500 ||
    status === 408 ||
    status === 429 ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("réseau")
  );
}

/**
 * Exécute une lecture en réessayant les défaillances passagères.
 *
 * À réserver aux lectures : une écriture rejouée risquerait de produire deux
 * fois le même effet.
 */
export async function avecReprise<T>(
  lecture: () => Promise<T>,
  { tentatives = 2, attenteInitiale = 400 }: Options = {}
): Promise<T> {
  let derniere: unknown;

  for (let essai = 0; essai <= tentatives; essai++) {
    try {
      return await lecture();
    } catch (erreur) {
      derniere = erreur;
      if (essai === tentatives || !estTemporaire(erreur)) break;
      // Attente croissante : insister immédiatement sur un réseau saturé
      // ne fait qu'aggraver la congestion.
      await attendre(attenteInitiale * 2 ** essai);
    }
  }

  throw derniere;
}

export { estTemporaire };
