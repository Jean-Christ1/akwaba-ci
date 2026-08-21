/**
 * Aides d'échappement pour les courriels sortants.
 *
 * Les corps de courriel sont assemblés par concaténation de chaînes : toute
 * valeur venant d'un visiteur ou d'un partenaire doit traverser escapeHtml,
 * sinon le destinataire reçoit du balisage choisi par un tiers.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Rend une valeur arbitraire sûre dans un nœud texte comme dans un attribut. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

/** Échappe puis convertit les sauts de ligne en <br/> pour un paragraphe. */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

/**
 * Nettoie un texte destiné à un en-tête de courriel (objet, nom d'expéditeur).
 * Les retours chariot et les caractères de contrôle sont retirés : ils n'ont
 * aucun sens dans un en-tête et sont le vecteur classique d'injection.
 */
export function sanitizeHeaderText(value: unknown, maxLength = 200): string {
  if (value === null || value === undefined) return "";
  const cleaned = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * Valide l'en-tête Origin avant de l'insérer dans un lien de courriel.
 * Cet en-tête est choisi par l'appelant : sans contrôle, il permet d'écrire
 * une destination arbitraire (ou du balisage) dans le courriel du partenaire.
 */
export function safeOrigin(rawOrigin: string | null | undefined, fallback: string): string {
  if (!rawOrigin) return fallback;
  try {
    const url = new URL(rawOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    if (url.username || url.password) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}
