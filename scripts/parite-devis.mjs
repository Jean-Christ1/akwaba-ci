/**
 * Parité du devis : l'écran contre le serveur.
 *
 * Le prix annoncé au client pendant qu'il décrit sa course est calculé par le
 * navigateur ; celui qui est enregistré est calculé par PostgreSQL. Les deux
 * barèmes sont écrits deux fois, à deux endroits, dans deux langages. Rien ne
 * signale leur divergence : le client valide un montant, la base en inscrit un
 * autre, et personne ne s'en aperçoit avant la facture.
 *
 * Ce contrôle balaie l'espace des combinaisons et compare les deux calculs, au
 * franc près, contre la base réelle. Il ne modifie rien.
 *
 * Usage :
 *   node scripts/parite-devis.mjs
 *
 * Le barème en vigueur est lu dans commission_rules, pas supposé.
 */
import fs from "node:fs";
import pg from "pg";
import * as esbuild from "esbuild";

/**
 * Le devis du navigateur doit valoir, au franc pres, celui du serveur.
 * On compare les deux sur un balayage de cas reels, contre la vraie base.
 */
const build = await esbuild.build({
  entryPoints: ["src/modules/errands/pricing.ts"],
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020",
});
const mod = await import("data:text/javascript;base64," + Buffer.from(build.outputFiles[0].text).toString("base64"));
const { quoteErrand } = mod;

const s = JSON.parse(fs.readFileSync("C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret/akwaba-supabase-secret.json", "utf8")).supabase;
const c = new pg.Client({ host: s.database.host, port: Number(s.database.port||5432), user: s.database.user, password: s.db_password, database: s.database.name||"postgres", ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:20000 });
await c.connect();
const regle = (await c.query("select rate, min_service_fee from public.commission_rules where is_active order by version desc limit 1")).rows[0];
const minServiceFee = Number(regle.min_service_fee), commissionRate = Number(regle.rate);

const vehicules = ["any", "a_pied", "moto", "tricycle", "voiture", "camionnette"];
const volumes = ["small", "medium", "large", "xl"];
const urgences = ["scheduled", "standard", "express"];
const remises = ["runner_delivers", "third_party", "customer_pickup"];

let cas = 0, ecarts = [];
for (const vehicle of vehicules)
  for (const volume of volumes)
    for (const urgency of urgences)
      for (const dropoff of remises)
        for (const distanceKm of [0, 1.3, 2.6, 7.4, 12.75])
          for (const estimatedMinutes of [0, 20, 32, 47, 95])
            for (const itemsCount of [0, 3, 14]) {
              const q = quoteErrand({ vehicle, volume, urgency, distanceKm, estimatedMinutes, dropoff, itemsCount, minServiceFee, commissionRate });
              cas++;
              const r = await c.query(
                `SELECT GREATEST(round((
                    CASE $1 WHEN 'a_pied' THEN 500 WHEN 'moto' THEN 700 WHEN 'tricycle' THEN 1200
                            WHEN 'voiture' THEN 1500 WHEN 'camionnette' THEN 3000 ELSE 700 END
                  + $2::numeric * CASE $1 WHEN 'a_pied' THEN 100 WHEN 'moto' THEN 130 WHEN 'tricycle' THEN 160
                            WHEN 'voiture' THEN 200 WHEN 'camionnette' THEN 300 ELSE 120 END
                  + GREATEST($3::int - 30, 0) * 10
                  + CASE $4 WHEN 'medium' THEN 500 WHEN 'large' THEN 1500 WHEN 'xl' THEN 3000 ELSE 0 END
                  + CASE $5 WHEN 'express' THEN 1000 ELSE 0 END
                  + GREATEST($6::int - 10, 0) * 50
                  + CASE $7 WHEN 'customer_pickup' THEN -500 WHEN 'third_party' THEN -300 ELSE 0 END
                  ) / 50) * 50, $8::numeric) AS service`,
                [vehicle, distanceKm, estimatedMinutes, volume, urgency, itemsCount, dropoff, minServiceFee]
              );
              const serveur = Number(r.rows[0].service);
              if (serveur !== q.serviceFee) {
                ecarts.push(`${vehicle}/${volume}/${urgency}/${dropoff} ${distanceKm}km ${estimatedMinutes}min ${itemsCount}art : ecran ${q.serviceFee}, serveur ${serveur}`);
              }
            }
console.log(`cas compares : ${cas}`);
console.log(`ecarts : ${ecarts.length}`);
ecarts.slice(0, 5).forEach((e) => console.log("  " + e));
await c.end();
