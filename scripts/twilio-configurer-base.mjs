/**
 * Depose les identifiants Twilio dans le coffre chiffre de la base.
 *
 * Ils ne peuvent pas vivre dans une migration : une migration est un fichier du
 * depot, versionne et pousse sur deux plateformes. Le coffre de Supabase les
 * chiffre au repos et n'en rend le clair qu'au proprietaire du schema, ce que
 * seules les fonctions du moteur traversent.
 *
 * Le script lit le coffre local, transmet une seule fois, et n'affiche jamais
 * une valeur. Relance, il met a jour sans dupliquer.
 *
 * Usage :
 *   node scripts/twilio-configurer-base.mjs             deposer ou mettre a jour
 *   node scripts/twilio-configurer-base.mjs --verifier  lire l'etat sans ecrire
 *   node scripts/twilio-configurer-base.mjs --retirer   effacer du coffre de la base
 */
import pg from "pg";

import { exigerConfiguration } from "./lib/connexion-base.mjs";
import { lireCoffre } from "./lib/twilio.mjs";

const verifierSeulement = process.argv.includes("--verifier");
const retirer = process.argv.includes("--retirer");

const twilio = lireCoffre();

const SECRETS = [
  ["twilio_account_sid", twilio.account_sid, "Identifiant du compte Twilio"],
  ["twilio_api_key_sid", twilio.api_key_application?.sid, "Cle d'API applicative"],
  ["twilio_api_key_secret", twilio.api_key_application?.secret, "Secret de la cle d'API"],
  ["twilio_whatsapp_from", twilio.whatsapp?.expediteur, "Expediteur WhatsApp"],
];

const c = new pg.Client(exigerConfiguration("configuration Twilio"));
await c.connect();

const etat = async () => {
  const r = await c.query(
    `select name, (decrypted_secret is not null) porte, length(decrypted_secret) taille
       from vault.decrypted_secrets where name = any($1::text[]) order by name`,
    [SECRETS.map(([n]) => n)]
  );
  return r.rows;
};

if (retirer) {
  const r = await c.query(`delete from vault.secrets where name = any($1::text[]) returning name`, [
    SECRETS.map(([n]) => n),
  ]);
  console.log(`${r.rowCount} secret(s) retire(s) du coffre de la base.`);
  await c.end();
  process.exit(0);
}

if (!verifierSeulement) {
  const manquants = SECRETS.filter(([, v]) => !v).map(([n]) => n);
  if (manquants.length) {
    console.error(`Absents du coffre local : ${manquants.join(", ")}`);
    await c.end();
    process.exit(1);
  }

  for (const [nom, valeur, description] of SECRETS) {
    // create_secret echoue si le nom existe deja : on met a jour dans ce cas
    // plutot que d'empiler des doublons que personne ne saurait departager.
    const existant = await c.query(`select id from vault.secrets where name = $1`, [nom]);
    if (existant.rowCount > 0) {
      await c.query(`select vault.update_secret($1, $2, $3, $4)`, [
        existant.rows[0].id,
        valeur,
        nom,
        description,
      ]);
    } else {
      await c.query(`select vault.create_secret($1, $2, $3)`, [valeur, nom, description]);
    }
  }
  console.log(`${SECRETS.length} secret(s) deposes dans le coffre de la base.`);
}

console.log("\netat du coffre de la base :");
for (const s of await etat()) {
  // On rend la longueur, jamais la valeur : elle suffit a constater qu'un
  // secret est bien la sans le faire fuiter dans un journal.
  console.log(`  ${s.name.padEnd(26)} present, ${s.taille} caracteres`);
}

const sante = await c.query(
  `select jsonb_build_object(
     'configure', public.secret_lire('twilio_api_key_sid') is not null,
     'expediteur', public.secret_lire('twilio_whatsapp_from'),
     'en_attente', (select count(*)::int from public.notification_outbox
                     where channel = 'whatsapp' and state = 'pending')
   ) s`
);
console.log("\nporteur WhatsApp :", JSON.stringify(sante.rows[0].s));

await c.end();
