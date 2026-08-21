/**
 * Remontée d'incident côté navigateur.
 *
 * Quand l'application casse chez un utilisateur, deux choses manquent : une
 * référence que la personne puisse citer au support, et une trace exploitable
 * ailleurs que dans sa propre console. Ce module produit la première et prépare
 * le point de branchement de la seconde.
 *
 * Aucun service de collecte n'est appelé ici, et c'est délibéré : confier les
 * erreurs d'un produit à un tiers engage l'éditeur sur le traitement de données
 * personnelles, ce qui relève d'un contrat, pas d'un choix d'implémentation.
 * `enregistrerCollecteurIncidents` est laissé ouvert pour le jour où ce contrat
 * existe.
 */
import { logger } from "./logger";

/** Contexte facultatif accompagnant un incident. */
export interface ContexteIncident {
  /** D'où vient l'incident : "rendu", "reseau", "paiement", etc. */
  origine?: string;
  /** Pile des composants React, quand la frontière d'erreur la fournit. */
  pileComposants?: string;
}

/** Ce qui est consigné, et ce qu'un collecteur recevrait. */
export interface RapportIncident {
  reference: string;
  horodatage: string;
  origine: string;
  message: string;
  chemin: string;
  pileComposants?: string;
  agent: string;
}

export type CollecteurIncident = (rapport: RapportIncident) => void;

/**
 * Alphabet sans les caractères qui se confondent quand une référence est dictée
 * au téléphone : ni O ni 0, ni I ni 1, ni B ni 8, ni S ni 5, ni Z ni 2.
 */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const PREFIXE = "AKW";
const TAILLE_BLOC = 4;
const NOMBRE_BLOCS = 2;

const CLE_STOCKAGE = "akwaba.incidents";
const MEMOIRE_MAX = 5;

let collecteur: CollecteurIncident | null = null;

/**
 * Produit une référence courte, lisible à voix haute et écrite sans ambiguïté.
 * Format : AKW-XXXX-XXXX.
 */
export function genererReferenceIncident(): string {
  const tirage = tirerOctets(TAILLE_BLOC * NOMBRE_BLOCS);
  const lettres = Array.from(tirage, (octet) => ALPHABET[octet % ALPHABET.length]);

  const blocs: string[] = [];
  for (let index = 0; index < NOMBRE_BLOCS; index += 1) {
    blocs.push(lettres.slice(index * TAILLE_BLOC, (index + 1) * TAILLE_BLOC).join(""));
  }

  return [PREFIXE, ...blocs].join("-");
}

/**
 * Branche, ou débranche, la destination des incidents.
 *
 * Appeler cette fonction avec `null` remet l'application dans son état par
 * défaut : rien ne sort du navigateur.
 */
export function enregistrerCollecteurIncidents(destination: CollecteurIncident | null): void {
  collecteur = destination;
}

/**
 * Consigne un incident et rend la référence à montrer à l'utilisateur.
 *
 * Ne lève jamais : elle est appelée depuis des chemins de reprise sur erreur, où
 * une seconde erreur ferait perdre la première.
 */
export function signalerIncident(
  erreur: unknown,
  contexte: ContexteIncident = {}
): RapportIncident {
  const rapport: RapportIncident = {
    reference: genererReferenceIncident(),
    horodatage: new Date().toISOString(),
    origine: contexte.origine ?? "inconnue",
    message: decrire(erreur),
    chemin: cheminCourant(),
    pileComposants: contexte.pileComposants,
    agent: typeof navigator === "undefined" ? "inconnu" : navigator.userAgent,
  };

  logger.error(`[incident ${rapport.reference}] ${rapport.origine} : ${rapport.message}`, rapport);
  memoriser(rapport);

  if (collecteur) {
    try {
      collecteur(rapport);
    } catch (echec) {
      logger.warn("[incident] le collecteur a échoué, l'incident reste local", echec);
    }
  }

  return rapport;
}

/**
 * Rend les derniers incidents de la session, du plus récent au plus ancien.
 *
 * Sert au support : la personne au bout du fil cite une référence, l'écran de
 * diagnostic la retrouve sans qu'elle ait à décrire ce qu'elle a fait.
 */
export function derniersIncidents(): RapportIncident[] {
  const brut = lireStockage();
  if (!brut) return [];

  try {
    const analyse: unknown = JSON.parse(brut);
    return Array.isArray(analyse) ? (analyse as RapportIncident[]) : [];
  } catch {
    return [];
  }
}

/** Vide la mémoire des incidents, par exemple à la déconnexion. */
export function oublierIncidents(): void {
  try {
    globalThis.sessionStorage?.removeItem(CLE_STOCKAGE);
  } catch {
    // Un navigateur qui refuse le stockage n'a rien à oublier.
  }
}

function tirerOctets(quantite: number): Uint8Array {
  const octets = new Uint8Array(quantite);
  const source = globalThis.crypto;

  if (source && typeof source.getRandomValues === "function") {
    source.getRandomValues(octets);
    return octets;
  }

  // Repli pour les environnements sans API cryptographique : une référence
  // d'incident n'est pas un secret, seule son unicité pratique compte.
  for (let index = 0; index < quantite; index += 1) {
    octets[index] = Math.floor(Math.random() * 256);
  }
  return octets;
}

function decrire(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message || erreur.name;
  if (typeof erreur === "string") return erreur;
  return "erreur sans message";
}

function cheminCourant(): string {
  if (typeof window === "undefined") return "inconnu";
  return `${window.location.pathname}${window.location.search}`;
}

function memoriser(rapport: RapportIncident): void {
  try {
    const conserves = [rapport, ...derniersIncidents()].slice(0, MEMOIRE_MAX);
    globalThis.sessionStorage?.setItem(CLE_STOCKAGE, JSON.stringify(conserves));
  } catch {
    // Navigation privée, quota atteint, stockage désactivé : la référence a déjà
    // été affichée et journalisée, la mémoire n'est qu'un confort.
  }
}

function lireStockage(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(CLE_STOCKAGE) ?? null;
  } catch {
    return null;
  }
}
