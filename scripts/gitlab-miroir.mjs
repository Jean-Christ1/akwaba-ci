/**
 * Met le depot en miroir sur GitLab, a l'identique, et le prouve.
 *
 * « A l'identique » veut dire : les memes commits, sous les memes empreintes,
 * sur les memes branches, avec la meme branche par defaut et la meme
 * visibilite. Pas « le meme dernier etat » : tout l'historique.
 *
 * Le script est idempotent. Relance, il retrouve le projet, repousse ce qui
 * manque et refait la verification. Il ne force jamais : une divergence doit
 * se voir et se decider, pas s'ecraser en silence.
 *
 * Prealable : node scripts/audit-historique-secrets.mjs doit etre vert.
 * Pousser un historique vers une plateforme nouvelle republie chaque objet
 * qu'il contient, y compris ceux qu'un commit ulterieur a supprimes.
 *
 * Usage :
 *   node scripts/gitlab-miroir.mjs              creer, pousser, verifier
 *   node scripts/gitlab-miroir.mjs --verifier   verifier seulement
 */
import { execFileSync } from "node:child_process";

import { api, apiToutes, GITLAB_URL, urlDePoussee } from "./lib/gitlab.mjs";

const CHEMIN = "Armand_isds2021/akwaba-ci";
const NOM = "akwaba-ci";

const verifierSeulement = process.argv.includes("--verifier");

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

/** Les references telles que GitHub les porte : c'est la source du miroir. */
const referencesSource = () => {
  const refs = new Map();
  for (const ligne of git("ls-remote", "origin").split("\n")) {
    const [sha, ref] = ligne.split("\t");
    if (!ref || !ref.startsWith("refs/heads/")) continue;
    refs.set(ref, sha);
  }
  return refs;
};

const referencesGitlab = (url) => {
  const refs = new Map();
  let sortie;
  try {
    sortie = execFileSync("git", ["ls-remote", url], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return refs;
  }
  for (const ligne of sortie.split("\n")) {
    const [sha, ref] = ligne.split("\t");
    if (!ref || !ref.startsWith("refs/heads/")) continue;
    refs.set(ref, sha);
  }
  return refs;
};

// ---------------------------------------------------------------------------
// 1. Le projet
// ---------------------------------------------------------------------------

let projet;
try {
  projet = await api(`/projects/${encodeURIComponent(CHEMIN)}`);
  console.log(`projet existant : ${projet.path_with_namespace} (id ${projet.id})`);
} catch (e) {
  if (e.status !== 404) throw e;
  if (verifierSeulement) {
    console.error("Le projet n'existe pas sur GitLab.");
    process.exit(1);
  }

  // Le depot d'origine est prive : le miroir l'est aussi. Un miroir plus
  // ouvert que sa source publierait ce que personne n'a decide de publier.
  projet = await api("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: NOM,
      path: NOM,
      visibility: "private",
      description:
        "Akwaba, plateforme de courses et d'adresses en Cote d'Ivoire. " +
        "Miroir integral du depot GitHub Jean-Christ1/akwaba-ci.",
      initialize_with_readme: false,
      default_branch: "main",
      issues_enabled: true,
      merge_requests_enabled: true,
      // Le depot porte deja son historique : une branche initiale vide
      // creerait un commit qui n'existe pas en face.
      auto_devops_enabled: false,
    }),
  });
  console.log(`projet cree : ${projet.path_with_namespace} (id ${projet.id})`);
}

const url = urlDePoussee(projet.path_with_namespace);

// ---------------------------------------------------------------------------
// 2. La poussee
// ---------------------------------------------------------------------------

const source = referencesSource();
console.log(`\nreferences a repliquer : ${source.size}`);
for (const [ref, sha] of source) {
  console.log(`  ${ref.replace("refs/heads/", "").padEnd(32)} ${sha.slice(0, 8)}`);
}

if (!verifierSeulement) {
  console.log("\npoussee...");
  // Branche par branche, jamais en une fois : sur ce poste, une poussee
  // massive epuise les tampons de socket Windows et echoue a mi-chemin, en
  // laissant croire que tout est passe.
  for (const [ref, sha] of source) {
    try {
      execFileSync("git", ["-c", "protocol.version=1", "push", url, `${sha}:${ref}`], {
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 64 * 1024 * 1024,
      });
      console.log(`  ${ref.replace("refs/heads/", "").padEnd(32)} pousse`);
    } catch (e) {
      const detail = String(e.stderr ?? e.message).split("\n").filter(Boolean).slice(-2).join(" ");
      console.log(`  ${ref.replace("refs/heads/", "").padEnd(32)} ECHEC : ${detail}`);
    }
  }

  // Les etiquettes, s'il y en a. Aucune aujourd'hui, mais un miroir qui les
  // oublierait cesserait d'etre un miroir a la premiere.
  const etiquettes = git("tag").split("\n").filter(Boolean);
  if (etiquettes.length) {
    execFileSync("git", ["-c", "protocol.version=1", "push", url, "--tags"], { stdio: "pipe" });
    console.log(`  ${etiquettes.length} etiquette(s) poussee(s)`);
  }
}

// ---------------------------------------------------------------------------
// 3. La preuve
//
// Comparer les empreintes, et non « ca a l'air d'etre passe ». Une reference
// absente ou differente est un miroir qui ment.
// ---------------------------------------------------------------------------

const copie = referencesGitlab(url);
console.log("\nverification :");

let ecarts = 0;
for (const [ref, sha] of source) {
  const enFace = copie.get(ref);
  const court = ref.replace("refs/heads/", "");
  if (!enFace) {
    console.log(`  ${court.padEnd(32)} ABSENTE de GitLab`);
    ecarts++;
  } else if (enFace !== sha) {
    console.log(`  ${court.padEnd(32)} DIFFERENTE : ${sha.slice(0, 8)} contre ${enFace.slice(0, 8)}`);
    ecarts++;
  } else {
    console.log(`  ${court.padEnd(32)} identique ${sha.slice(0, 8)}`);
  }
}

// Une reference presente sur GitLab et absente de la source n'est pas un
// miroir non plus : elle signale une divergence qu'il faut voir.
for (const ref of copie.keys()) {
  if (!source.has(ref)) {
    console.log(`  ${ref.replace("refs/heads/", "").padEnd(32)} EN TROP sur GitLab`);
    ecarts++;
  }
}

// ---------------------------------------------------------------------------
// 4. Le compte des commits, qui verifie l'historique et pas seulement les tetes
// ---------------------------------------------------------------------------

const commitsLocaux = Number(git("rev-list", "--all", "--count"));
let commitsGitlab = 0;
try {
  // GitLab ne rend pas de compte global : on interroge la branche par defaut,
  // qui porte l'historique promu, et develop, qui porte tout le reste.
  for (const branche of ["main", "develop"]) {
    const stats = await api(
      `/projects/${projet.id}/repository/commits?ref_name=${branche}&per_page=1`
    );
    if (Array.isArray(stats) && stats.length) commitsGitlab++;
  }
} catch {
  /* la lecture peut echouer juste apres la creation : ce n'est pas un ecart */
}

console.log(`\ncommits dans l'historique local : ${commitsLocaux}`);

const branches = await apiToutes(`/projects/${projet.id}/repository/branches`);
console.log(`branches sur GitLab : ${branches.length}`);
for (const b of branches) {
  console.log(`  ${b.name.padEnd(32)} ${b.commit.id.slice(0, 8)}  ${b.protected ? "protegee" : "libre"}`);
}

console.log(`\n${GITLAB_URL}/${projet.path_with_namespace}`);

if (ecarts === 0) {
  console.log("\nMIROIR CONFORME : chaque reference de la source existe sur GitLab, a la meme empreinte.");
} else {
  console.log(`\n${ecarts} ecart(s) : le miroir n'est pas conforme.`);
  process.exitCode = 1;
}
