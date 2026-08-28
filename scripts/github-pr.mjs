/**
 * Ouvre ou met a jour une demande de fusion sur GitHub.
 *
 * La ligne de commande gh n'est pas installee sur cette machine. Le jeton
 * existe pourtant : le gestionnaire d'identifiants de Git le detient deja, et
 * c'est lui qui authentifie chaque poussee. On le lui demande plutot que d'en
 * creer un second, qui vivrait ailleurs et expirerait sans que personne ne
 * sache lequel des deux est le bon.
 *
 * Le jeton n'est jamais affiche, ni ecrit, ni passe en argument : il ne quitte
 * pas la memoire du processus.
 *
 * Usage :
 *   node scripts/github-pr.mjs --base develop --head <branche> \
 *        --titre "..." --corps-fichier <chemin>
 *   node scripts/github-pr.mjs --lister
 *   node scripts/github-pr.mjs --fusionner <numero> [--methode merge|squash|rebase]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const arg = (nom, defaut = null) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
};
const drapeau = (nom) => process.argv.includes(nom);

/** Le depot, lu de l'origine plutot que suppose. */
function depot() {
  const url = execFileSync("git", ["ls-remote", "--get-url", "origin"], {
    encoding: "utf8",
  }).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`L'origine n'est pas un depot GitHub : ${url}`);
  return { proprietaire: m[1], nom: m[2] };
}

/** Le jeton du gestionnaire d'identifiants, jamais affiche. */
function jeton() {
  const sortie = execFileSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const ligne = sortie.split(/\r?\n/).find((l) => l.startsWith("password="));
  if (!ligne) {
    throw new Error(
      "Aucun identifiant GitHub dans le gestionnaire. Poussez une fois a la main pour l'y deposer."
    );
  }
  return ligne.slice("password=".length);
}

const { proprietaire, nom } = depot();
const cle = jeton();

async function api(chemin, options = {}) {
  const reponse = await fetch(`https://api.github.com/repos/${proprietaire}/${nom}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cle}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const corps = await reponse.text();
  let donnees = null;
  try {
    donnees = corps ? JSON.parse(corps) : null;
  } catch {
    donnees = { message: corps.slice(0, 300) };
  }
  if (!reponse.ok) {
    const detail = donnees?.errors?.map((e) => e.message).join(" ; ") ?? "";
    throw new Error(`${reponse.status} ${donnees?.message ?? ""} ${detail}`.trim());
  }
  return donnees;
}

if (drapeau("--lister")) {
  const liste = await api("/pulls?state=open&per_page=30");
  if (liste.length === 0) console.log("Aucune demande de fusion ouverte.");
  for (const p of liste) {
    console.log(`#${p.number}  ${p.head.ref} -> ${p.base.ref}  ${p.title}`);
  }
  process.exit(0);
}

const aFusionner = arg("--fusionner");
if (aFusionner) {
  const methode = arg("--methode", "merge");
  const p = await api(`/pulls/${aFusionner}`);
  if (p.mergeable === false) {
    console.error(`La demande #${aFusionner} n'est pas fusionnable : ${p.mergeable_state}.`);
    process.exit(1);
  }
  const r = await api(`/pulls/${aFusionner}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: methode }),
  });
  console.log(r.merged ? `Fusionnee : ${r.sha}` : `Non fusionnee : ${r.message}`);
  process.exit(r.merged ? 0 : 1);
}

const base = arg("--base", "develop");
const head = arg("--head");
const titre = arg("--titre");
const corpsFichier = arg("--corps-fichier");
if (!head || !titre) {
  console.error("Il faut au moins --head et --titre.");
  process.exit(1);
}
const corps = corpsFichier ? fs.readFileSync(corpsFichier, "utf8") : "";

// Une demande deja ouverte se met a jour plutot que de se dupliquer : deux
// demandes pour la meme branche divergent, et personne ne sait plus laquelle
// fait foi.
const existantes = await api(
  `/pulls?state=open&head=${encodeURIComponent(`${proprietaire}:${head}`)}`
);

if (existantes.length > 0) {
  const p = existantes[0];
  await api(`/pulls/${p.number}`, {
    method: "PATCH",
    body: JSON.stringify({ title: titre, body: corps }),
  });
  console.log(`Mise a jour : #${p.number} ${p.html_url}`);
} else {
  const p = await api("/pulls", {
    method: "POST",
    body: JSON.stringify({ title: titre, head, base, body: corps }),
  });
  console.log(`Ouverte : #${p.number} ${p.html_url}`);
}
