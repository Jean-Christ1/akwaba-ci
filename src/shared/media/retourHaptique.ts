/**
 * Retour haptique sur les actions qui engagent.
 *
 * Un shopper valide une remise debout dans la rue, souvent d'une seule main,
 * parfois sous le soleil où l'écran est difficile à lire. Une brève vibration
 * lui dit que c'est passé sans qu'il ait à relire quoi que ce soit.
 *
 * Le retour reste discret et rare : il ne signale que ce qui a une conséquence,
 * une remise validée, un paiement confirmé, un refus. Vibrer à chaque toucher
 * fatiguerait l'utilisateur et viderait sa batterie sans rien lui apprendre.
 *
 * L'API n'existe ni sur iOS ni sur poste fixe : son absence n'est pas une
 * erreur, simplement un appareil qui ne vibre pas.
 */

type Intention = "succes" | "echec" | "attention";

// Motifs en millisecondes : vibration, pause, vibration. Deux impulsions
// courtes pour un refus, une seule pour une réussite : la différence se sent
// sans qu'on ait besoin de l'apprendre.
const MOTIFS: Record<Intention, number | number[]> = {
  succes: 30,
  attention: 20,
  echec: [40, 60, 40],
};

export function vibrer(intention: Intention = "succes"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(MOTIFS[intention]);
  } catch {
    // Certains navigateurs refusent la vibration hors interaction directe.
    // Ce n'est pas une erreur qui mérite d'interrompre quoi que ce soit.
  }
}
