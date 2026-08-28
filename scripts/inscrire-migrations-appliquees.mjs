/**
 * Inscrit au registre les migrations deja appliquees a la base.
 *
 * Le script d'application n'inscrivait rien. Vingt-neuf migrations vivaient
 * donc en base sans y figurer, et tout outil qui se fie au registre les croyait
 * en attente. La recette des gardes, qui rejoue ce qui reste a faire, echouait
 * sur une fonction dont une migration ulterieure avait change le type de
 * retour : elle rejouait du passe sur un present qui l'avait deja depasse.
 *
 * Inscrire sans verifier serait pire que le mal : une migration jamais
 * appliquee passerait pour faite, et son absence ne se decouvrirait qu'au
 * prochain deploiement. Chaque migration est donc reconnue a un objet qu'elle
 * cree, et seules celles dont l'objet existe sont inscrites.
 *
 * Usage :
 *   node scripts/inscrire-migrations-appliquees.mjs            constater
 *   node scripts/inscrire-migrations-appliquees.mjs --inscrire ecrire
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { exigerConfiguration } from "./lib/connexion-base.mjs";

const ecrire = process.argv.includes("--inscrire");
const DOSSIER = "supabase/migrations";

/**
 * Un objet que la migration cree, et par lequel on la reconnait.
 *
 * On prend le premier de la liste : une table si elle en cree une, sinon une
 * fonction. Une migration qui ne cree ni l'une ni l'autre reste a verifier a la
 * main plutot que d'etre inscrite sur parole.
 */
/**
 * Les migrations que la reconnaissance automatique ne sait pas nommer.
 *
 * Elles ne creent ni table, ni fonction, ni vue, ni travail planifie : elles
 * corrigent des privileges ou posent du contenu. Chacune a ete verifiee a la
 * main contre la base, et la requete ecrite ici est cette verification. On ne
 * les inscrit pas sur parole : on les inscrit sur preuve.
 */
const VERIFIEES_A_LA_MAIN = {
  // Retire les ecritures accordees sur les vues et restaure la colonne
  // abandonnees de notification_health, en security_invoker.
  "20260827240000": {
    preuve:
      `select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'notification_health'
          and c.column_name = 'abandonnees'
          and exists (
            select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
             where n.nspname = 'public' and k.relname = 'notification_health'
               and 'security_invoker=on' = any(k.reloptions)
          )`,
    quoi: "notification_health porte abandonnees, en security_invoker",
  },
  // Depose les six reponses reservees a l'exploitation sur la configuration
  // Twilio.
  "20260827320000": {
    preuve:
      `select 1 from public.help_articles
        where slug = 'twilio-etat-du-compte' and audience = 'exploitation'`,
    quoi: "le guide Twilio est au centre d'aide",
  },
};

function signature(sql) {
  const table = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)/i);
  if (table) return { genre: "table", nom: table[1] };
  const fonction = sql.match(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)/i);
  if (fonction) return { genre: "fonction", nom: fonction[1] };
  // Toutes les migrations ne creent pas d'objet. Certaines posent du contenu,
  // une vue, une politique ou un travail planifie, et il faut savoir les
  // reconnaitre aussi : sinon elles restent hors du registre pour toujours.
  const vue = sql.match(/CREATE OR REPLACE VIEW public\.([a-z_]+)/i);
  if (vue) return { genre: "vue", nom: vue[1] };
  const travail = sql.match(/cron\.schedule\(\s*'([a-z0-9-]+)'/i);
  if (travail) return { genre: "travail", nom: travail[1] };
  const article = sql.match(/\(\s*'([a-z0-9-]+)',\s*'[^']+',\s*'(?:client|shopper|partenaire|tous|exploitation)'/i);
  if (article) return { genre: "article", nom: article[1] };
  const politique = sql.match(/CREATE POLICY "([^"]+)" ON public\.([a-z_]+)/i);
  if (politique) return { genre: "politique", nom: politique[1], sur: politique[2] };
  return null;
}

const c = new pg.Client(exigerConfiguration("inscription des migrations"));
await c.connect();

const deja = new Set(
  (await c.query("select version from supabase_migrations.schema_migrations")).rows.map(
    (r) => r.version
  )
);

const fichiers = fs
  .readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => !deja.has(f.split("_")[0]));

if (fichiers.length === 0) {
  console.log("Le registre est a jour : aucune migration appliquee ne lui manque.");
  await c.end();
  process.exit(0);
}

const aInscrire = [];
const aVerifier = [];

for (const f of fichiers) {
  const version = f.split("_")[0];
  const aLaMain = VERIFIEES_A_LA_MAIN[version];
  if (aLaMain) {
    const vue = await c.query(aLaMain.preuve);
    if (vue.rowCount > 0) aInscrire.push([f, aLaMain.quoi]);
    else aVerifier.push([f, `${aLaMain.quoi} : preuve absente`]);
    continue;
  }

  const sql = fs.readFileSync(path.join(DOSSIER, f), "utf8");
  const s = signature(sql);
  if (!s) {
    aVerifier.push([f, "aucun objet reconnaissable"]);
    continue;
  }

  const REQUETES = {
    table: `select 1 from information_schema.tables
             where table_schema = 'public' and table_name = $1`,
    fonction: `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = $1`,
    vue: `select 1 from information_schema.views
           where table_schema = 'public' and table_name = $1`,
    travail: `select 1 from cron.job where jobname = $1`,
    article: `select 1 from public.help_articles where slug = $1`,
    politique: `select 1 from pg_policy where polname = $1`,
  };

  const existe =
    (await c.query(REQUETES[s.genre], [s.nom])).rowCount > 0;

  if (existe) aInscrire.push([f, `${s.genre} ${s.nom}`]);
  else aVerifier.push([f, `${s.genre} ${s.nom} absente de la base`]);
}

console.log(`${aInscrire.length} migration(s) reconnue(s) comme appliquee(s) :`);
for (const [f, preuve] of aInscrire) console.log(`  ${f}  (${preuve})`);

if (aVerifier.length) {
  console.log(`\n${aVerifier.length} a verifier a la main, non inscrite(s) :`);
  for (const [f, raison] of aVerifier) console.log(`  ${f}  (${raison})`);
}

if (!ecrire) {
  console.log("\nRien n'a ete ecrit. Relancez avec --inscrire pour inscrire la premiere liste.");
  await c.end();
  process.exit(0);
}

await c.query("begin");
for (const [f] of aInscrire) {
  await c.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2) on conflict (version) do nothing`,
    [f.split("_")[0], f.replace(/^\d+_/, "").replace(/\.sql$/, "")]
  );
}
await c.query("commit");
console.log(`\n${aInscrire.length} migration(s) inscrite(s) au registre.`);
await c.end();
