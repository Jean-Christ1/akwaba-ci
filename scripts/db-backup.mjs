/**
 * Prend une sauvegarde de la base avant une opération risquée.
 *
 * Deux fichiers sont produits, séparés parce qu'ils se restaurent séparément :
 * le schéma, puis les données. Restaurer des données sur un schéma divergent
 * échoue sur les contraintes ; les garder distincts laisse le choix de ne
 * remonter que ce qui a été perdu.
 *
 * Seul le schéma `public` est couvert. Les schémas `auth` et `storage`
 * appartiennent à la plateforme Supabase, qui les sauvegarde elle-même et n'en
 * autorise pas la restauration par ce chemin.
 *
 * L'outil employé est pg_dump, appelé directement. La commande
 * `supabase db dump` ferait la même chose, mais elle exécute pg_dump dans un
 * conteneur, et ce poste n'a pas de moteur de conteneurs. Si pg_dump est absent,
 * ce script s'arrête et dit quoi faire, au lieu d'échouer à moitié.
 *
 * Usage :
 *   SUPABASE_DB_URL=... node scripts/db-backup.mjs --out <dossier>
 *
 * Le dossier de destination est obligatoire et doit se trouver hors du dépôt :
 * une sauvegarde contient des données personnelles et n'a rien à faire sous
 * contrôle de version.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";

const URL_BASE = process.env.SUPABASE_DB_URL;

if (!URL_BASE) {
  console.error(
    "Variable manquante : SUPABASE_DB_URL.\n" +
      "Renseignez la chaîne de connexion Postgres du projet, en mode URI."
  );
  process.exit(1);
}

const indexSortie = process.argv.indexOf("--out");
const dossierDemande = indexSortie === -1 ? null : process.argv[indexSortie + 1];

if (!dossierDemande) {
  console.error(
    "Destination manquante : --out <dossier>.\n" +
      "Choisissez un emplacement hors du dépôt : une sauvegarde contient des\n" +
      "données personnelles et ne doit jamais être versionnée."
  );
  process.exit(1);
}

const racine = process.cwd();
const destination = path.resolve(
  dossierDemande,
  `akwaba-${new Date().toISOString().replace(/[:.]/g, "-")}`
);

if (destination.startsWith(racine + path.sep)) {
  console.error(
    "Destination refusée : elle se trouve dans le dépôt.\n" +
      "Une sauvegarde porte des données personnelles ; un dépôt se pousse."
  );
  process.exit(1);
}

if (!disponible("pg_dump")) {
  console.error(
    "pg_dump est introuvable.\n\n" +
      "Trois voies possibles :\n" +
      "  1. installer les outils client PostgreSQL sur ce poste, puis relancer ;\n" +
      "  2. lancer la sauvegarde depuis un serveur qui les porte déjà ;\n" +
      "  3. utiliser la sauvegarde gérée du projet, console Supabase, rubrique\n" +
      "     Database puis Backups, dont la disponibilité dépend du plan souscrit.\n\n" +
      "Ce poste n'installe pas de moteur de conteneurs, `supabase db dump` n'est\n" +
      "donc pas une option ici."
  );
  process.exit(1);
}

mkdirSync(destination, { recursive: true });

console.log(`Base sauvegardée : ${hoteLisible(URL_BASE)}`);
console.log(`Destination : ${destination}`);

const ETAPES = [
  { nom: "schema.sql", libelle: "schéma", options: ["--schema-only"] },
  { nom: "data.sql", libelle: "données", options: ["--data-only"] },
];

for (const etape of ETAPES) {
  const fichier = path.join(destination, etape.nom);
  process.stdout.write(`Sauvegarde du ${etape.libelle}... `);

  /**
   * `shell: false` est délibéré : la chaîne de connexion porte le mot de passe
   * et ne doit traverser aucun interpréteur, où elle finirait dans un historique.
   */
  const resultat = spawnSync(
    "pg_dump",
    ["--dbname", URL_BASE, "--schema", "public", "--no-owner", ...etape.options, "--file", fichier],
    { stdio: ["ignore", "inherit", "inherit"], shell: false }
  );

  if (resultat.status !== 0) {
    console.error(`\nÉchec de l'étape ${etape.libelle} (code ${resultat.status}).`);
    console.error("La sauvegarde est incomplète : ne lancez pas l'opération risquée.");
    process.exit(resultat.status ?? 1);
  }

  console.log(`fait, ${Math.round(statSync(fichier).size / 1024)} Ko.`);
}

console.log(
  "\nSauvegarde terminée. Ouvrez les deux fichiers pour vérifier qu'ils ne sont\n" +
    "pas vides avant de lancer l'opération pour laquelle vous l'avez prise.\n" +
    "La procédure de restauration figure dans docs/EXPLOITATION.md."
);

/** Vérifie la présence d'un exécutable sans dépendre du système d'exploitation. */
function disponible(commande) {
  const sonde = spawnSync(commande, ["--version"], { stdio: "ignore", shell: false });
  return !sonde.error && sonde.status === 0;
}

/** Affiche l'hôte d'une chaîne de connexion sans son mot de passe. */
function hoteLisible(chaine) {
  try {
    const analysee = new URL(chaine);
    return `${analysee.hostname}${analysee.port ? `:${analysee.port}` : ""}${analysee.pathname}`;
  } catch {
    return "chaîne de connexion illisible";
  }
}
