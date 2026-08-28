/**
 * La validation de la note de moderation, isolee de la fonction servie.
 *
 * Elle vivait dans index.ts, qui appelle Deno.serve au chargement du module.
 * Le test qui l'importait demarrait donc un serveur HTTP et ne le fermait
 * jamais : la suite Deno tombait sur une erreur non rattrapee, sans rapport
 * avec ce qu'elle voulait verifier.
 *
 * Les autres fonctions du depot separent deja leur validation de leur point
 * d'entree, pour cette raison exactement.
 */

const NOTE_MAX = 2000;

const PROHIBITED = [
  /\b(fuck|shit|bitch|asshole|connard|enculé|salope|pute)\b/i,
  /<script\b/i,
  /https?:\/\/\S{0,}\.(ru|tk|xyz)\b/i,
];

export type NoteValide =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

export function validateNote(action: string, note: string | null | undefined): NoteValide {
  const n = (note ?? "").trim();
  if (action === "rejected" && n.length < 10) {
    return { ok: false, error: "Une note d'au moins 10 caractères est requise pour un refus." };
  }
  if (n.length > NOTE_MAX) {
    return { ok: false, error: `Note trop longue (max ${NOTE_MAX} caractères).` };
  }
  for (const re of PROHIBITED) {
    if (re.test(n)) return { ok: false, error: "Contenu de la note non autorisé." };
  }
  return { ok: true, note: n.length ? n : null };
}
