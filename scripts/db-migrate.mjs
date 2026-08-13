/**
 * Applique les migrations en attente sur la base Supabase.
 *
 * Enveloppe volontairement mince autour de l'interface en ligne de commande
 * Supabase, qui reste la seule source de vérité sur l'historique des migrations.
 * Ce que cette enveloppe ajoute, et qui manquait :
 *
 *   - la chaîne de connexion est lue dans l'environnement, jamais écrite dans
 *     un fichier ni passée par un interpréteur de commandes ;
 *   - rien n'est appliqué sans le drapeau explicite `--apply`, parce qu'une
 *     migration poussée par inadvertance ne se défait pas ;
 *   - la sortie ne laisse jamais fuir le mot de passe : seul l'hôte est affiché.
 *
 * Usage :
 *   SUPABASE_DB_URL=... node scripts/db-migrate.mjs            # simulation
 *   SUPABASE_DB_URL=... node scripts/db-migrate.mjs --apply    # application
 *
 * Drapeaux :
 *   --apply         applique réellement les migrations
 *   --include-all   inclut les migrations absentes de l'historique distant
 *
 * La chaîne de connexion se récupère dans la console Supabase, rubrique
 * « Project Settings », « Database », « Connection string », en mode URI. Le mot
 * de passe qu'elle contient doit être encodé pour une URL.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const URL_BASE = process.env.SUPABASE_DB_URL;
const VERSION_CLI = process.env.SUPABASE_CLI_VERSION ?? "2";

if (!URL_BASE) {
  console.error(
    "Variable manquante : SUPABASE_DB_URL.\n" +
      "Renseignez la chaîne de connexion Postgres du projet, en mode URI, avec\n" +
      "le mot de passe encodé pour une URL. Ne l'inscrivez dans aucun fichier."
  );
  process.exit(1);
}

const appliquer = process.argv.includes("--apply");
const toutInclure = process.argv.includes("--include-all");

console.log(`Base ciblée : ${hoteLisible(URL_BASE)}`);
console.log(appliquer ? "Mode : application réelle." : "Mode : simulation (ajoutez --apply pour appliquer).");

const arguments_ = ["--yes", `supabase@${VERSION_CLI}`, "db", "push", "--db-url", URL_BASE];
if (!appliquer) arguments_.push("--dry-run");
if (toutInclure) arguments_.push("--include-all");

const lanceur = resoudreNpx();
if (!lanceur) {
  console.error(
    "npx est introuvable. L'interface en ligne de commande Supabase ne peut pas\n" +
      "être lancée. Installez Node 20 ou plus, puis relancez."
  );
  process.exit(1);
}

/**
 * `shell: false` est délibéré : la chaîne de connexion porte le mot de passe et
 * ne doit traverser aucun interpréteur, où elle finirait dans un historique de
 * commandes, et où le caractère pour cent d'un mot de passe encodé serait pris
 * pour une expansion de variable.
 */
const resultat = spawnSync(lanceur.commande, [...lanceur.prefixe, ...arguments_], {
  stdio: "inherit",
  shell: false,
});

if (resultat.error) {
  console.error("L'interface en ligne de commande Supabase n'a pas pu être lancée.");
  console.error(resultat.error.message);
  process.exit(1);
}

if (resultat.status !== 0) {
  console.error(`Échec : la commande s'est terminée avec le code ${resultat.status}.`);
  process.exit(resultat.status ?? 1);
}

if (appliquer) {
  console.log(
    "\nMigrations appliquées.\n" +
      "Rappel : si l'une d'elles ajoute une colonne à la table errands, elle doit\n" +
      "se terminer par SELECT public.refresh_errand_column_grants();, sinon la\n" +
      "lecture de la table casse pour tout le monde. Le test src/test/errands-grants\n" +
      "vérifie ce point, exécutez npm run test avant de livrer le front."
  );
} else {
  console.log("\nAucune migration n'a été appliquée. Relancez avec --apply une fois la liste vérifiée.");
}

/**
 * Rend de quoi lancer npx sans passer par un interpréteur de commandes.
 *
 * Sous Windows, npx est un fichier de commandes que Node refuse d'exécuter
 * directement depuis la version 18.20 ; on s'adresse donc au script npm-cli
 * livré à côté de l'exécutable Node, ce qui évite d'avoir à activer le shell.
 */
function resoudreNpx() {
  if (process.platform !== "win32") return { commande: "npx", prefixe: [] };

  const script = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  return existsSync(script) ? { commande: process.execPath, prefixe: [script] } : null;
}

/**
 * Extrait l'hôte d'une chaîne de connexion pour l'afficher sans son mot de passe.
 * L'opérateur doit pouvoir vérifier qu'il ne se trompe pas de base, et rien de plus.
 */
function hoteLisible(chaine) {
  try {
    const analysee = new URL(chaine);
    return `${analysee.hostname}${analysee.port ? `:${analysee.port}` : ""}${analysee.pathname}`;
  } catch {
    return "chaîne de connexion illisible";
  }
}
