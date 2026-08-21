/**
 * La connexion à la base, pour les recettes.
 *
 * Trois recettes sur quatre lisaient le fichier de secrets par un chemin absolu
 * Windows. Elles ne pouvaient donc tourner que sur le poste de leur auteur, et
 * c'est la raison pour laquelle aucune n'était jouée par la chaîne d'intégration
 * continue : le moteur d'argent était éprouvé à la main, ou pas du tout.
 *
 * L'ordre de lecture suit celui que `recette-parcours.mjs` employait déjà, pour
 * ne pas inventer un second contrat : les variables d'environnement d'abord,
 * puis le fichier local en repli quand il existe. Aucun nom de variable nouveau
 * n'est introduit.
 */
import fs from "node:fs";

/** Chemin du coffre local, hors du dépôt et jamais versionné. */
const COFFRE_LOCAL =
  process.env.AKWABA_SECRET_FILE ??
  "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret/akwaba-supabase-secret.json";

/**
 * Rend la configuration de connexion, ou null si aucune source n'est
 * disponible. Rendre null plutôt que lever laisse l'appelant décider s'il
 * s'ignore, ce qui est le comportement attendu dans une chaîne sans secrets.
 */
export function configurationBase() {
  const parEnvironnement = {
    host: process.env.SUPABASE_DB_HOST,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    database: process.env.SUPABASE_DB_NAME || "postgres",
  };

  if (parEnvironnement.host && parEnvironnement.user && parEnvironnement.password) {
    return { ...parEnvironnement, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 };
  }

  if (!fs.existsSync(COFFRE_LOCAL)) return null;

  const s = JSON.parse(fs.readFileSync(COFFRE_LOCAL, "utf8")).supabase;
  return {
    host: s.database.host,
    port: Number(s.database.port || 5432),
    user: s.database.user,
    password: s.db_password,
    database: s.database.name || "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  };
}

/**
 * Sort proprement quand aucune source d'identifiants n'existe.
 *
 * Une recette qui échoue faute de secrets ferait rougir la chaîne pour une
 * raison qui n'a rien à voir avec le code. Elle s'ignore donc, en le disant.
 */
export function exigerConfiguration(nomRecette) {
  const config = configurationBase();
  if (config) return config;
  console.log(
    `(${nomRecette} ignorée : ni variables d'environnement SUPABASE_DB_*, ni coffre local.)`
  );
  process.exit(0);
}

export default configurationBase;
