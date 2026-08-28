/**
 * Parité du devis : l'écran contre le serveur.
 *
 * Les tarifs ne sont plus écrits qu'une fois, dans `pricing_rules`. Restent
 * deux formules, l'une en TypeScript pour chiffrer pendant que le client
 * remplit son formulaire, l'autre en PL/pgSQL pour enregistrer le montant qui
 * fera foi. Elles lisent les mêmes nombres, mais rien ne garantit qu'elles en
 * font le même usage.
 *
 * Ce contrôle balaie l'espace des combinaisons, sur toutes les villes du
 * référentiel, et compare les deux calculs au franc près contre la base
 * réelle. Il ne modifie rien.
 *
 * Usage :
 *   node scripts/parite-devis.mjs
 */
import pg from "pg";
import * as esbuild from "esbuild";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const build = await esbuild.build({
  entryPoints: ["src/modules/errands/grilleTarifaire.ts"],
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020",
});
const { lireGrille, devisDepuisGrille } = await import(
  "data:text/javascript;base64," + Buffer.from(build.outputFiles[0].text).toString("base64")
);

const c = new pg.Client(exigerConfiguration("parité du devis"));
await c.connect();

// La grille lue est celle que le navigateur lit : la même fonction, le même
// contrat. Comparer contre une grille écrite à la main ici ne prouverait rien.
const grille = lireGrille((await c.query("select public.active_pricing_grid() g")).rows[0].g);
if (!grille) {
  console.error("Aucun barème n'est publié : rien à comparer.");
  await c.end();
  process.exit(1);
}
console.log(`barème version ${grille.version} (${grille.label})`);

const villes = (await c.query("select slug, name from public.service_cities order by slug")).rows;
const vehicules = Object.keys(grille.vehicles);
const volumes = Object.keys(grille.volume);
const urgences = Object.keys(grille.urgency);
const remises = Object.keys(grille.dropoff);

let cas = 0;
const ecarts = [];

/**
 * La majoration en cours, telle que le navigateur la recevrait.
 *
 * Elle ne se deduit pas de la grille : elle depend de l'heure et de la ville.
 * La comparaison doit donc se faire deux fois, sans elle et avec elle, sinon la
 * moitie du calcul reste hors de portee du controle.
 */
const majorationDe = async (nomVille) => {
  const r = await c.query("select * from public.surge_en_vigueur($1)", [nomVille]);
  const l = r.rows[0];
  return l
    ? { multiplicateur: Number(l.multiplicateur), motif: String(l.motif), fin: String(l.fin) }
    : null;
};

const comparer = async (etiquette) => {
for (const ville of villes)
  for (const vehicle of vehicules)
    for (const volume of volumes)
      for (const urgency of urgences)
        for (const dropoff of remises)
          for (const distanceKm of [0, 1.4, 7.3, 22])
            for (const [estimatedMinutes, itemsCount] of [[0, 0], [45, 3], [120, 31]]) {
              const entree = {
                vehicle, volume, urgency, dropoff,
                distanceKm, estimatedMinutes, itemsCount, citySlug: ville.slug,
              };
              const ecran = devisDepuisGrille(entree, grille, await majorationDe(ville.name));
              // Le serveur reçoit le nom de la ville, comme errand_create le lui
              // passe : c'est ce chemin-là qu'il faut éprouver, pas un autre.
              const serveur = (await c.query(
                "select public.pricing_quote($1,$2,$3,$4,$5,$6,$7,$8) q",
                [ville.name, vehicle, volume, urgency, dropoff, distanceKm, estimatedMinutes, itemsCount]
              )).rows[0].q;

              cas++;
              for (const champ of ["serviceFee", "commission", "runnerPayout"]) {
                if (Number(ecran[champ]) !== Number(serveur[champ])) {
                  ecarts.push(
                    `[${etiquette}] ${ville.slug}/${vehicle}/${volume}/${urgency}/${dropoff}/` +
                    `${distanceKm}km/${estimatedMinutes}min/${itemsCount}art ${champ} : ` +
                    `écran ${ecran[champ]}, serveur ${serveur[champ]}`
                  );
                }
              }
            }
};

// Premiere passe : le cas courant, sans majoration.
await comparer("sans majoration");

// Seconde passe : une majoration en cours, posee dans une transaction annulee.
// Sans elle, la moitie du calcul du prix n'aurait jamais ete comparee.
await c.query("begin");
await c.query(
  `insert into public.pricing_surges (city_slug, multiplicateur, motif, fin)
   values ('abidjan', 1.5, 'Controle de parite : majoration simulee', now() + interval '1 hour')`
);
await comparer("avec majoration");
await c.query("rollback");

await c.end();

console.log(`cas comparés : ${cas}`);
if (ecarts.length === 0) {
  console.log("AUCUN ECART : l'écran annonce ce que le serveur enregistre.");
} else {
  console.error(`ECARTS : ${ecarts.length}`);
  for (const e of ecarts.slice(0, 10)) console.error("  " + e);
  process.exit(1);
}
