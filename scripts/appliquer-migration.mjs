/**
 * Applique une migration a la base reelle, dans une transaction, et l'inscrit.
 *
 * Sans transaction, une migration qui echoue a mi-chemin laisse le schema dans
 * un etat que personne n'a decrit : la moitie des objets crees, l'autre non.
 *
 * Sans inscription, c'est pire et plus discret : la migration est bien
 * appliquee, mais rien ne le dit. Tout outil qui se fie au registre la croit
 * en attente et la rejoue. Une migration qui change le type de retour d'une
 * fonction echoue alors sur son propre travail, et c'est exactement ce qui est
 * arrive : vingt-neuf migrations vivaient en base sans y figurer, et la recette
 * des gardes, qui rejoue ce qui reste a faire, ne passait plus.
 *
 * Usage :
 *   node scripts/appliquer-migration.mjs <chemin.sql>
 *   node scripts/appliquer-migration.mjs --inscrire <chemin.sql>   inscrire sans appliquer
 */
import fs from "node:fs";
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const inscrireSeulement = process.argv.includes("--inscrire");
const chemin = process.argv.filter((a) => a !== "--inscrire")[2];
if (!chemin) { console.error("Indiquez le fichier de migration."); process.exit(1); }

const fichier = chemin.split(/[\/]/).pop();
// Le registre de Supabase classe par le prefixe horodate du nom de fichier.
const version = fichier.split("_")[0];
const nom = fichier.replace(/^\d+_/, "").replace(/\.sql$/, "");

const c = new pg.Client(exigerConfiguration("application de migration"));
await c.connect();
try {
  await c.query("begin");
  if (!inscrireSeulement) await c.query(fs.readFileSync(chemin, "utf8"));
  // L'inscription entre dans la meme transaction que la migration : appliquer
  // sans inscrire, ou inscrire sans appliquer, laisse le registre et la base en
  // desaccord, et c'est ce desaccord qui se paie plus tard.
  await c.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2) on conflict (version) do nothing`,
    [version, nom]
  );
  await c.query("commit");
  console.log(inscrireSeulement ? "inscrite :" : "applique :", fichier);
} catch (e) {
  await c.query("rollback");
  console.error("ECHEC, rien n'a ete applique :", e.message);
  process.exit(1);
} finally { await c.end(); }
