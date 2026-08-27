/**
 * Ce que GitLab sait deja de nous.
 *
 * A lancer avant tout miroir : creer un projet la ou il en existe deja un, ou
 * pousser dans un espace de noms qui n'est pas le bon, se defait mal.
 *
 * Usage : node scripts/gitlab-etat.mjs
 */
import { api, apiToutes, GITLAB_URL, GITLAB_USER } from "./lib/gitlab.mjs";

const moi = await api("/user");
console.log(`compte    : ${moi.username} (id ${moi.id}, ${moi.state})`);
console.log(`serveur   : ${GITLAB_URL}`);
if (moi.username !== GITLAB_USER) {
  console.log(`  le coffre annonce ${GITLAB_USER}, le jeton ouvre ${moi.username}`);
}

try {
  const pat = await api("/personal_access_tokens/self");
  console.log(`jeton     : ${pat.name}`);
  console.log(`  portees : ${(pat.scopes ?? []).join(", ") || "aucune"}`);
  console.log(`  expire  : ${pat.expires_at ?? "jamais"}`);
  console.log(`  actif   : ${pat.active ? "oui" : "NON"}`);

  // Un miroir demande d'ecrire dans le depot ET de creer un projet. Sans la
  // portee « api », la creation echouera apres coup, une fois l'historique
  // deja pousse ailleurs.
  const manquantes = ["api", "write_repository"].filter((p) => !(pat.scopes ?? []).includes(p));
  if (manquantes.length) {
    console.log(`  ATTENTION : portees absentes pour un miroir : ${manquantes.join(", ")}`);
  }
} catch (e) {
  console.log(`jeton     : portees non lisibles (${e.status ?? "?"})`);
}

const espaces = await apiToutes("/namespaces");
console.log(`\nespaces de noms (${espaces.length}) :`);
for (const n of espaces) {
  console.log(`  ${n.full_path.padEnd(32)} ${n.kind}`);
}

const projets = await apiToutes("/projects?membership=true&order_by=last_activity_at");
console.log(`\nprojets accessibles (${projets.length}) :`);
for (const p of projets.slice(0, 30)) {
  console.log(
    `  ${p.path_with_namespace.padEnd(44)} ${String(p.visibility).padEnd(8)} ` +
      `defaut=${p.default_branch ?? "-"}  maj ${String(p.last_activity_at).slice(0, 10)}`
  );
}

// Un projet portant deja le nom vise change tout : on met a jour au lieu de
// creer, et il faut savoir ce qu'il contient avant d'y pousser quoi que ce soit.
const candidats = projets.filter((p) => /akwaba/i.test(p.path_with_namespace));
console.log(`\nprojets nommes « akwaba » : ${candidats.length}`);
for (const p of candidats) {
  console.log(`  ${p.path_with_namespace} (id ${p.id}), defaut ${p.default_branch ?? "aucun"}`);
}
