/**
 * Acces a l'API Twilio, en un seul endroit.
 *
 * Le jeton est lu dans le coffre et n'est jamais affiche ni journalise. Toutes
 * les commandes qui parlent a Twilio passent par ici, de facon que la lecture
 * du secret et la construction de l'URL ne soient ecrites qu'une fois.
 */
import fs from "node:fs";

const COFFRE = "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret";
const FICHIER = `${COFFRE}/akwaba-twilio-secret.json`;

export function lireCoffre() {
  return JSON.parse(fs.readFileSync(FICHIER, "utf8"));
}

export function ecrireCoffre(contenu) {
  fs.writeFileSync(FICHIER, JSON.stringify(contenu, null, 2) + "\n", "utf8");
}

/**
 * Appelle l'API Twilio avec l'authentification de base.
 *
 * On s'authentifie par le couple compte + jeton principal pour administrer
 * (creer une cle, lister les expediteurs), et par une cle d'API pour envoyer.
 * Melanger les deux donnerait a l'application le pouvoir de se creer des cles.
 */
export async function twilio(chemin, options = {}) {
  const secret = lireCoffre();
  const identifiant = options.cle?.sid ?? secret.account_sid;
  const motDePasse = options.cle?.secret ?? secret.auth_token;

  // Un chemin vide designe la ressource du compte lui-meme, qui s'ecrit avec
  // son suffixe : sans lui, Twilio repond 401 avec un message trompeur sur les
  // comptes d'essai, alors que l'URL est simplement incomplete.
  const url = chemin.startsWith("http")
    ? chemin
    : `${secret.api_base}/Accounts/${secret.account_sid}${chemin || ".json"}`;

  const entetes = {
    Authorization: "Basic " + Buffer.from(`${identifiant}:${motDePasse}`).toString("base64"),
    ...(options.headers ?? {}),
  };

  let corps;
  if (options.form) {
    entetes["Content-Type"] = "application/x-www-form-urlencoded";
    corps = new URLSearchParams(options.form).toString();
  }

  const reponse = await fetch(url, { method: options.method ?? "GET", headers: entetes, body: corps });
  const texte = await reponse.text();

  let resultat = null;
  try {
    resultat = texte ? JSON.parse(texte) : null;
  } catch {
    resultat = texte;
  }

  if (!reponse.ok) {
    // Le message de Twilio porte le code d'erreur et son explication : le
    // masquer obligerait a deviner ce qui a echoue.
    const detail =
      resultat && typeof resultat === "object"
        ? `${resultat.code ?? ""} ${resultat.message ?? JSON.stringify(resultat).slice(0, 200)}`
        : String(resultat).slice(0, 200);
    const erreur = new Error(`Twilio ${reponse.status} sur ${chemin} : ${detail}`);
    erreur.status = reponse.status;
    erreur.corps = resultat;
    throw erreur;
  }

  return resultat;
}

/** L'API de messagerie vit sur un autre hote que l'API de compte. */
export async function twilioMessaging(chemin, options = {}) {
  return twilio(`https://messaging.twilio.com/v1${chemin}`, options);
}
