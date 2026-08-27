/**
 * Recette des avis aux etablissements et de la compatibilite de la file.
 *
 * Deux sujets lies. Le premier : une demande de reservation doit reellement
 * prevenir l'etablissement, par le canal qu'il a. Le second : le porteur
 * deploye ne sait envoyer que des courriels, et les fonctions serveur ne
 * peuvent pas etre redeployees depuis ce poste. Il ne doit donc jamais
 * recevoir un message WhatsApp, sous peine de le condamner en cinq tentatives.
 *
 * Tout se passe dans une transaction annulee : rien ne subsiste.
 *
 * Usage : node scripts/recette-avis-partenaires.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des avis partenaires"));
await c.connect();
await c.query("begin");

let n = 0;
const echecs = [];

const etape = async (titre, fn) => {
  n++;
  try {
    await c.query("savepoint etape");
    const detail = await fn();
    await c.query("release savepoint etape");
    console.log(`  ${n}. ${titre} : OK${detail ? "  " + detail : ""}`);
  } catch (e) {
    await c.query("rollback to savepoint etape").catch(() => {});
    echecs.push(`${n}. ${titre} : ${e.message}`);
    console.log(`  ${n}. ${titre} : ECHEC - ${e.message}`);
  }
};

let compteur = 0;
const creerLieu = async (champs) => {
  compteur++;
  return (
    await c.query(
      `insert into public.places (slug, name, type, city, address, tagline, description,
         lat, lng, standing, price_band, status, email, whatsapp)
       values ($1, $2, 'lodging', 'Abidjan', 'Adresse de recette', 'Recette', 'Recette',
         5.336, -4.026, 3, 'EUR', 'published', $3, $4)
       returning id`,
      [
        `recette-lieu-${compteur}`,
        `Lieu de recette ${compteur}`,
        champs.email ?? null,
        champs.whatsapp ?? null,
      ]
    )
  ).rows[0].id;
};

const deposerDemande = async (placeId) =>
  (
    await c.query(
      `insert into public.leads (place_id, kind, full_name, email, phone, party_size,
         date_from, date_to, message)
       values ($1, 'lodging', 'Client Recette', 'client@exemple.test', '+225 07 00 00 00 09',
         2, current_date + 3, current_date + 5, 'Deux nuits, arrivee en soiree.')
       returning id`,
      [placeId]
    )
  ).rows[0].id;

const avis = async (placeId) => {
  const nom = (
    await c.query(`select name from public.places where id = $1`, [placeId])
  ).rows[0].name;
  return (
    await c.query(
      `select channel, destination, subject, body, state::text, repli_motif
         from public.notification_outbox
        where event like 'lead_%' and subject like '%' || $1 || '%'
        order by created_at desc limit 1`,
      [nom]
    )
  ).rows[0];
};

try {
  await etape("un etablissement avec WhatsApp est prevenu sur WhatsApp", async () => {
    const lieu = await creerLieu({ whatsapp: "+225 07 55 44 33 22", email: "hotel@exemple.test" });
    await deposerDemande(lieu);
    const a = await avis(lieu);
    if (!a) throw new Error("aucun avis depose");
    if (a.channel !== "whatsapp") throw new Error(`canal ${a.channel}`);
    if (!a.destination.includes("07 55 44 33 22")) throw new Error(`destination ${a.destination}`);
    return `${a.channel} -> ${a.destination}`;
  });

  await etape("sans WhatsApp, l'avis part par courriel et la raison est inscrite", async () => {
    const lieu = await creerLieu({ email: "hotel2@exemple.test" });
    await deposerDemande(lieu);
    const a = await avis(lieu);
    if (a.channel !== "email") throw new Error(`canal ${a.channel}`);
    if (a.destination !== "hotel2@exemple.test") throw new Error(`destination ${a.destination}`);
    if (!a.repli_motif) throw new Error("aucune raison de repli inscrite");
    return `${a.channel} (${a.repli_motif})`;
  });

  await etape("l'avis porte de quoi rappeler sans ouvrir l'application", async () => {
    const lieu = await creerLieu({ whatsapp: "+225 07 55 44 33 21" });
    await deposerDemande(lieu);
    const a = await avis(lieu);
    for (const attendu of ["Client Recette", "07 00 00 00 09", "Personnes : 2"]) {
      if (!a.body.includes(attendu)) throw new Error(`le message ne porte pas « ${attendu} »`);
    }
    if (!a.subject.includes("Lieu de recette")) throw new Error(`sujet : ${a.subject}`);
    return "nom, telephone et sejour presents";
  });

  await etape("un etablissement injoignable est inscrit au journal d'audit", async () => {
    const lieu = await creerLieu({});
    await deposerDemande(lieu);
    const trace = (
      await c.query(
        `select count(*)::int n from public.audit_logs
          where action = 'place_injoignable' and entity_id = $1`,
        [lieu]
      )
    ).rows[0].n;
    if (trace === 0) throw new Error("aucune trace : personne ne saura qu'on n'a pas su prevenir");
    return "trace posee";
  });

  await etape("la demande est enregistree meme si personne n'est joignable", async () => {
    const lieu = await creerLieu({});
    const demande = await deposerDemande(lieu);
    const existe = (
      await c.query(`select count(*)::int n from public.leads where id = $1`, [demande])
    ).rows[0].n;
    if (existe !== 1) throw new Error("la demande a ete perdue");
    return "demande conservee";
  });

  await etape("le porteur qui ne connait que le courriel ne recoit aucun WhatsApp", async () => {
    // C'est le point critique : les fonctions serveur ne peuvent pas etre
    // redeployees depuis ce poste. Le porteur en place reclamerait un message
    // WhatsApp, echouerait cinq fois et le condamnerait.
    // La file doit contenir au moins un message WhatsApp en attente, sans quoi
    // un lot vide passerait pour une preuve.
    await c.query(`update public.notification_outbox set state = 'pending', attempts = 0`);
    const lieu = await creerLieu({ whatsapp: "+225 07 55 44 33 20" });
    await deposerDemande(lieu);
    const enAttente = (
      await c.query(
        `select count(*)::int n from public.notification_outbox
          where state = 'pending' and channel = 'whatsapp'`
      )
    ).rows[0].n;
    if (enAttente === 0) throw new Error("aucun message whatsapp en attente : rien a eprouver");

    const lot = (await c.query(`select * from public.notify_claim_batch(50)`)).rows;
    const canaux = [...new Set(lot.map((x) => x.canal))];
    if (canaux.some((x) => x !== "email")) {
      throw new Error(`le porteur par defaut recoit ${canaux.join(", ")}`);
    }
    return `${enAttente} whatsapp en attente, ${lot.length} ligne(s) remises, toutes en courriel`;
  });

  await etape("un porteur capable, lui, recoit bien le WhatsApp", async () => {
    const lieu = await creerLieu({ whatsapp: "+225 07 55 44 33 19" });
    await deposerDemande(lieu);
    const lot = (
      await c.query(`select * from public.notify_claim_batch(50, array['email','whatsapp'])`)
    ).rows;
    if (!lot.some((x) => x.canal === "whatsapp")) {
      throw new Error("un porteur qui declare whatsapp n'en recoit pas");
    }
    return "recu";
  });

  await etape("un avis par courriel a un partenaire sans compte porte son adresse", async () => {
    // Le porteur en place lit la colonne « email » et rien d'autre. Si elle
    // valait NULL pour un destinataire sans compte, l'avis partirait vers nulle
    // part et serait compte comme envoye.
    const lieu = await creerLieu({ email: "sans-compte@exemple.test" });
    await deposerDemande(lieu);
    const lot = (await c.query(`select * from public.notify_claim_batch(50)`)).rows;
    const ligne = lot.find((x) => x.destination === "sans-compte@exemple.test");
    if (!ligne) throw new Error("l'avis n'est pas reclame");
    if (ligne.email !== "sans-compte@exemple.test") {
      throw new Error(`la colonne email vaut ${ligne.email ?? "NULL"}`);
    }
    return "adresse portee";
  });
} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} etapes vertes`);
console.log("(transaction annulee : la base est intacte)");
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
