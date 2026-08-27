/**
 * Verifie que les comptes de demonstration se connectent vraiment.
 *
 * Creer un compte en base ne prouve rien : le mot de passe peut etre mal
 * hache, le courriel non confirme, la politique d'authentification refuser.
 * Seule une connexion reelle contre le service d'authentification le dit.
 *
 * Le mot de passe est lu dans le coffre et n'est jamais affiche.
 *
 * Usage : node scripts/verifier-comptes-demonstration.mjs
 */
import fs from "node:fs";

const COFFRE = "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret";
const sup = JSON.parse(fs.readFileSync(`${COFFRE}/akwaba-supabase-secret.json`, "utf8")).supabase;
const fiche = JSON.parse(fs.readFileSync(`${COFFRE}/akwaba-demo-accounts.json`, "utf8"));

if (!Array.isArray(fiche.comptes) || fiche.comptes.length === 0) {
  console.error("Aucun compte de demonstration dans la fiche.");
  process.exit(1);
}

let ok = 0;
const echecs = [];

for (const compte of fiche.comptes) {
  const reponse = await fetch(`${sup.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: sup.anon_key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: compte.email, password: fiche.mot_de_passe_commun }),
  });
  const corps = await reponse.json();

  if (reponse.status === 200 && corps.access_token) {
    // On verifie aussi ce que le compte peut reellement faire, pas seulement
    // qu'il entre : un compte applicatif ne doit porter aucun droit de console.
    const droits = await fetch(`${sup.url}/rest/v1/rpc/my_permissions`, {
      method: "POST",
      headers: {
        apikey: sup.anon_key,
        Authorization: `Bearer ${corps.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const liste = droits.ok ? await droits.json() : [];
    const attendu = compte.droits_effectifs ?? 0;
    if (liste.length !== attendu) {
      echecs.push(`${compte.email} : ${liste.length} droit(s) au lieu de ${attendu}`);
      console.log(`  ${compte.email.padEnd(34)} ECART DE DROITS ${liste.length}/${attendu}`);
    } else {
      ok++;
      console.log(`  ${compte.email.padEnd(34)} connexion OK, ${liste.length} droit(s) de console`);
    }
  } else {
    echecs.push(`${compte.email} : ${corps.error_description ?? corps.msg ?? reponse.status}`);
    console.log(`  ${compte.email.padEnd(34)} ECHEC ${corps.error_description ?? reponse.status}`);
  }
}

console.log(`\n${ok}/${fiche.comptes.length} comptes utilisables`);
console.log(`connexion : ${fiche.connexion_url}`);
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
