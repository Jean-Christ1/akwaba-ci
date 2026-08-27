/**
 * Dit ce qui est reellement deploye cote Supabase.
 *
 * Modifier une fonction serveur dans le depot ne la deploie pas. Sans ce
 * controle, on croit avoir corrige un comportement qui continue de tourner
 * dans sa version precedente, et on l'annonce comme corrige.
 *
 * Usage : node scripts/etat-fonctions-serveur.mjs
 */
import fs from "node:fs";

const COFFRE = "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret";
const sup = JSON.parse(fs.readFileSync(`${COFFRE}/akwaba-supabase-secret.json`, "utf8")).supabase;

const reponse = await fetch(
  `https://api.supabase.com/v1/projects/${sup.project_id}/functions`,
  { headers: { Authorization: `Bearer ${sup.access_token}` } }
);

if (reponse.status !== 200) {
  const corps = await reponse.text();
  console.error(`API de gestion Supabase : HTTP ${reponse.status}`);
  console.error(corps.slice(0, 200));
  console.error("");
  console.error("Le jeton du coffre ne permet pas de deployer les fonctions serveur.");
  console.error("Les modifications du depot restent donc en attente cote Supabase.");
  process.exit(1);
}

const deployees = await reponse.json();
const locales = fs
  .readdirSync("supabase/functions", { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name);

console.log("Fonctions deployees sur Supabase :");
for (const f of deployees) {
  console.log(`  ${f.slug.padEnd(24)} version ${f.version}  ${f.status}  maj ${new Date(f.updated_at).toISOString().slice(0, 10)}`);
}

const absentes = locales.filter((l) => !deployees.some((d) => d.slug === l));
if (absentes.length) {
  console.log("\nPresentes dans le depot, absentes du projet :");
  for (const a of absentes) console.log(`  ${a}`);
}
