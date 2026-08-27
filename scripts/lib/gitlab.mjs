/**
 * Acces a l'API GitLab, en un seul endroit.
 *
 * Le jeton est lu dans le coffre et n'est jamais affiche ni journalise. Toutes
 * les commandes qui parlent a GitLab passent par ici, de facon que la lecture
 * du secret et la construction de l'URL ne soient ecrites qu'une fois.
 */
import fs from "node:fs";

const COFFRE = "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret";

const secret = JSON.parse(fs.readFileSync(`${COFFRE}/gitlab-api-secret.json`, "utf8"));

export const GITLAB_URL = secret.gitlab_url ?? "https://gitlab.com";
export const GITLAB_USER = secret.username;

/** Le jeton n'est expose que par cette fonction, pour un usage immediat. */
export function jeton() {
  return secret.private_token;
}

/**
 * Appelle l'API et rend le corps analyse.
 *
 * Les erreurs portent le code et le message de GitLab : un echec muet sur une
 * operation de miroir laisserait croire que la copie est complete.
 */
export async function api(chemin, options = {}) {
  const url = chemin.startsWith("http") ? chemin : `${GITLAB_URL}/api/v4${chemin}`;
  const reponse = await fetch(url, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": secret.private_token,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const texte = await reponse.text();
  let corps = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }

  if (!reponse.ok) {
    const detail =
      corps && typeof corps === "object"
        ? JSON.stringify(corps).slice(0, 300)
        : String(corps).slice(0, 300);
    const erreur = new Error(`GitLab ${reponse.status} sur ${chemin} : ${detail}`);
    erreur.status = reponse.status;
    erreur.corps = corps;
    throw erreur;
  }

  return corps;
}

/** Parcourt toutes les pages d'une collection. */
export async function apiToutes(chemin) {
  const tout = [];
  for (let page = 1; page <= 50; page++) {
    const separateur = chemin.includes("?") ? "&" : "?";
    const lot = await api(`${chemin}${separateur}per_page=100&page=${page}`);
    if (!Array.isArray(lot) || lot.length === 0) break;
    tout.push(...lot);
    if (lot.length < 100) break;
  }
  return tout;
}

/**
 * URL de poussee, jeton compris.
 *
 * A n'utiliser que comme argument immediat de git, jamais a journaliser :
 * l'inscrire dans un remote persistant le deposerait en clair dans .git/config.
 */
export function urlDePoussee(cheminProjet) {
  const hote = GITLAB_URL.replace(/^https?:\/\//, "");
  return `https://oauth2:${secret.private_token}@${hote}/${cheminProjet}.git`;
}
