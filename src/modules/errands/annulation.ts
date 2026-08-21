import type { ErrandStatus } from "@/modules/errands/domain";

/**
 * Ce qui décide, ou non, d'annuler une course.
 *
 * Ces fonctions vivaient dans l'écran du détail. Les en sortir n'est pas une
 * question de rangement : un fichier qui exporte à la fois un composant et des
 * fonctions perd le rechargement à chaud de Vite, et l'outil de compilation le
 * signale à chaque passage.
 */

export type CancelDecision = { proceed: false } | { proceed: true; reason: string };

/**
 * Ce que répond la fenêtre de saisie du motif d'annulation.
 *
 * window.prompt rend null quand l'utilisateur ferme la fenêtre ou appuie sur
 * Échap, ce qui n'est pas une chaîne vide : c'est un refus. Les deux étaient
 * confondus par un `?? ""`, et l'appel à errand_cancel suivait sans condition.
 * La course était donc annulée alors que l'utilisateur venait de renoncer, et
 * une annulation ne se reprend pas.
 */
export function cancelDecision(prompted: string | null): CancelDecision {
  if (prompted === null) return { proceed: false };
  return { proceed: true, reason: prompted };
}

/**
 * Les cas où le serveur refuse déjà une annulation : course terminée, déjà
 * annulée, livrée (il renvoie vers le litige), ou dont le règlement est fait.
 * L'écran n'excluait ni la livraison ni le paiement : le bouton était proposé
 * sur une course livrée ou réglée, et le clic ne pouvait que retourner une
 * erreur. Le litige reste retiré de la liste, comme avant : une course déjà
 * contestée se tranche par le litige, pas par une annulation.
 */
const ANNULATION_REFUSEE: ErrandStatus[] = ["completed", "cancelled", "disputed", "delivered"];

/**
 * Le serveur refuse en outre l'annulation par le client dès que le shopper a
 * engagé les achats : l'annuler d'un clic le laisserait débiteur de sa
 * marchandise, sans recours, puisque le litige est refusé sur une course
 * annulée. Le shopper enregistre sa facture pendant « en courses » ou « en
 * livraison », donc ce cas se produit avant la livraison, dans le cours normal
 * d'une mission. Laisser le bouton actif y garantit une erreur.
 */
export function canCancelErrand(
  status: ErrandStatus,
  paymentStatus: string,
  achats: { itemsTotal: number; receiptUrl: string | null } = { itemsTotal: 0, receiptUrl: null }
): boolean {
  if (ANNULATION_REFUSEE.includes(status) || paymentStatus === "paid") return false;
  return achats.itemsTotal <= 0 && !achats.receiptUrl;
}
