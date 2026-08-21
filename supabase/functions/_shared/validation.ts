/**
 * Contrôles de forme communs aux fonctions edge.
 *
 * Sans ces contrôles, une valeur libre atteint PostgreSQL et déclenche une
 * erreur de type (22P02 pour un uuid, 22007 pour une date) renvoyée en 500
 * au visiteur, au lieu d'un refus de validation lisible.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Le formulaire de demande emploie un champ date pour les hébergements et un
// champ date et heure pour tout le reste : restaurant, activité, transport. Le
// second produit « 2026-09-01T19:30 », que PostgreSQL accepte parfaitement.
// N'admettre que la date civile revenait à refuser toute réservation qui n'est
// pas une nuitée.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 && EMAIL_RE.test(value);
}

/**
 * Date civile ou date et heure au format ISO, réellement existante.
 *
 * La vérification ne se contente pas de la forme : elle reconstruit la date et
 * compare, ce qui écarte le 31 février, que l'expression régulière laisse
 * passer et que le navigateur n'empêche pas toujours de saisir.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;

  if (ISO_DATE_RE.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  if (ISO_DATETIME_RE.test(value)) {
    const parsed = new Date(`${value}Z`);
    if (Number.isNaN(parsed.getTime())) return false;
    // La partie date doit survivre à l'aller-retour : sinon « 2026-02-31T10:00 »
    // deviendrait le 3 mars sans que personne ne s'en aperçoive.
    return parsed.toISOString().slice(0, 10) === value.slice(0, 10);
  }

  return false;
}

/** Adresse http(s) sans identifiants intégrés, longueur bornée. */
export function isHttpUrl(value: unknown, maxLength = 500): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Renvoie une chaîne nettoyée si elle respecte les bornes, sinon undefined.
 * Une valeur absente donne null : les colonnes concernées sont nullables.
 */
export function optionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return undefined;
  return trimmed;
}

/** Chaîne obligatoire dont la longueur utile est encadrée. */
export function requiredText(
  value: unknown,
  minLength: number,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return undefined;
  return trimmed;
}

/**
 * Entier accepté sous forme numérique ou textuelle : le formulaire partenaire
 * transporte ses champs numériques en chaînes de caractères.
 */
export function boundedInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
  if (parsed < min || parsed > max) return undefined;
  return parsed;
}

/** Nombre décimal borné, accepté lui aussi sous forme textuelle. */
export function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
  return parsed;
}

/**
 * Liste de chaînes courtes destinée à une colonne jsonb. Les entrées vides
 * sont écartées, le nombre d'entrées et leur taille sont plafonnés pour que
 * la fiche ne serve pas de dépôt de données arbitraires.
 */
export function stringList(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] | undefined {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  if (value.length > maxItems) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > maxItemLength) return undefined;
    out.push(trimmed);
  }
  return out;
}
