import { FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";

/**
 * Message affiché quand la fonction de bordure n'a rien dit d'intelligible.
 *
 * Sans cet utilitaire, le bandeau reprenait le message par défaut du client
 * Supabase, « Edge Function returned a non-2xx status code ». Un partenaire
 * dont la description faisait huit caractères apprenait donc qu'un code HTTP
 * n'était pas dans les 200, et jamais quel champ corriger. Le même écran
 * masquait aussi le 429 « Trop de fiches envoyées ».
 */
export const GENERIC_EDGE_ERROR_MESSAGE =
  "Le service n'a pas pu traiter votre demande. Réessayez dans un instant.";

/** Au-delà de cette longueur, un corps de réponse n'est plus une phrase. */
const MAX_MESSAGE_LENGTH = 300;

/**
 * Ne retient que ce qui peut être montré tel quel.
 *
 * Une pile d'appels ou un rendu d'exception tient sur plusieurs lignes et
 * dépasse la phrase : le laisser passer reviendrait à afficher la trace du
 * serveur au visiteur, ce que la correction cherche précisément à éviter.
 */
function readableSentence(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH || text.includes("\n")) return null;
  return text;
}

/**
 * Le corps d'une réponse ne se lit qu'une fois. S'il a déjà été consommé, ou
 * si la connexion est coupée en cours de lecture, il vaut mieux un message
 * générique qu'une exception levée depuis le gestionnaire d'erreur lui-même.
 */
async function readBody(response: Response): Promise<string | null> {
  try {
    if (response.bodyUsed) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Rend le message qu'une fonction de bordure a réellement écrit.
 *
 * Le client Supabase range la réponse HTTP dans `context`, et seulement pour
 * FunctionsHttpError et FunctionsRelayError (vérifié dans FunctionsClient.js
 * de @supabase/functions-js 2.112.3, où `throw new FunctionsHttpError(response)`
 * est levé avant toute lecture du corps). C'est le seul endroit où le message
 * de la fonction survit à l'appel : les appelants faisaient `throw error` puis
 * affichaient `error.message`, qui ne contient que le libellé générique de la
 * classe.
 */
export async function edgeErrorMessage(error: unknown): Promise<string> {
  if (!(error instanceof FunctionsHttpError) && !(error instanceof FunctionsRelayError)) {
    return GENERIC_EDGE_ERROR_MESSAGE;
  }

  const response: unknown = error.context;
  if (!(response instanceof Response)) return GENERIC_EDGE_ERROR_MESSAGE;

  const raw = await readBody(response);
  if (raw === null) return GENERIC_EDGE_ERROR_MESSAGE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Un corps qui n'est pas du JSON ne vient pas de nos fonctions, qui
    // répondent toutes par json({ error }) : il vient du runtime ou de la
    // passerelle, et porte une trace technique, jamais une consigne de saisie.
    return GENERIC_EDGE_ERROR_MESSAGE;
  }

  if (!parsed || typeof parsed !== "object") return GENERIC_EDGE_ERROR_MESSAGE;
  const body = parsed as { error?: unknown; message?: unknown };

  return (
    readableSentence(body.error) ?? readableSentence(body.message) ?? GENERIC_EDGE_ERROR_MESSAGE
  );
}
