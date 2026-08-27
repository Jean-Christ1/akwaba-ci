/**
 * Recette des demandes de reservation.
 *
 * Une demande d'hotel ou de table etait enregistree, l'etablissement prevenu,
 * et pour celui qui l'avait faite elle disparaissait : aucun ecran ne la lui
 * montrait. Le nouvel ecran la lui rend, mais il ne doit lui rendre QUE les
 * siennes : la table porte des noms, des telephones et des dates de sejour.
 *
 * Contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-demandes-reservation.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des demandes"));
await c.connect();
await c.query("begin");

let n = 0;
const echecs = [];
const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
const creerCompte = async () => {
  compteur++;
  return (
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), '', '', '', '', now(), now())
       returning id`,
      [`demande-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const creerLieu = async (proprietaire = null) => {
  compteur++;
  return (
    await c.query(
      `insert into public.places (slug, name, type, city, address, tagline, description,
         lat, lng, standing, price_band, status, whatsapp, owner_id)
       values ($1, $2, 'lodging', 'Abidjan', 'Adresse', 'Recette', 'Recette',
         5.336, -4.026, 3, 'EUR', 'published', '+225 07 88 77 66 55', $3)
       returning id`,
      [`recette-hotel-${compteur}`, `Hotel de recette ${compteur}`, proprietaire]
    )
  ).rows[0].id;
};

const deposer = async (client, lieu) =>
  (
    await c.query(
      `insert into public.leads (user_id, place_id, kind, full_name, email, phone,
         party_size, date_from, date_to, message)
       values ($1, $2, 'lodging', 'Client Recette', 'client@exemple.test', '+225 07 00 00 00 09',
         '2', current_date + 3, current_date + 5, 'Deux nuits')
       returning id`,
      [client, lieu]
    )
  ).rows[0].id;

/** Lit la table sous l'identite donnee, avec les politiques appliquees. */
const lireSous = async (uid, sql, params = []) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
  try {
    return (await c.query(sql, params)).rows;
  } finally {
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
  }
};

try {
  await etape("le client retrouve sa propre demande", async () => {
    const client = await creerCompte();
    const lieu = await creerLieu();
    const id = await deposer(client, lieu);

    const lignes = await lireSous(
      client,
      `select id, status::text, party_size from public.leads where user_id = $1`,
      [client]
    );
    if (lignes.length !== 1) throw new Error(`${lignes.length} demande(s) au lieu d'une`);
    if (lignes[0].id !== id) throw new Error("ce n'est pas sa demande");
    if (lignes[0].status !== "new") throw new Error(`statut ${lignes[0].status}`);
    return `statut ${lignes[0].status}`;
  });

  await etape("un tiers ne voit pas la demande d'un autre", async () => {
    // La table porte des noms, des telephones et des dates de sejour : une
    // fuite ici dirait a un inconnu quand un logement sera vide.
    const client = await creerCompte();
    const intrus = await creerCompte();
    const lieu = await creerLieu();
    await deposer(client, lieu);

    const lignes = await lireSous(intrus, `select id from public.leads`);
    if (lignes.length !== 0) throw new Error(`${lignes.length} demande(s) visibles par un tiers`);
    return "aucune";
  });

  await etape("le proprietaire de l'etablissement voit les demandes qui le concernent", async () => {
    const client = await creerCompte();
    const partenaire = await creerCompte();
    const lieu = await creerLieu(partenaire);
    await deposer(client, lieu);

    const lignes = await lireSous(partenaire, `select id from public.leads`);
    if (lignes.length !== 1) throw new Error(`${lignes.length} demande(s) pour le partenaire`);
    return "la sienne";
  });

  await etape("un partenaire ne voit pas les demandes d'un autre etablissement", async () => {
    const client = await creerCompte();
    const partenaireA = await creerCompte();
    const partenaireB = await creerCompte();
    const lieuA = await creerLieu(partenaireA);
    await creerLieu(partenaireB);
    await deposer(client, lieuA);

    const lignes = await lireSous(partenaireB, `select id from public.leads`);
    if (lignes.length !== 0) throw new Error(`${lignes.length} demande(s) visibles`);
    return "aucune";
  });

  await etape("le client ne peut pas changer le statut de sa demande", async () => {
    // Le statut dit ce que l'etablissement a fait. Laisser le demandeur
    // l'ecrire lui permettrait de se declarer rappele.
    const client = await creerCompte();
    const lieu = await creerLieu();
    const id = await deposer(client, lieu);

    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: client, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    const r = await c.query(
      `update public.leads set status = 'contacted' where id = $1 returning id`,
      [id]
    );
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    await c.query("rollback to savepoint etape");

    if (r.rowCount !== 0) throw new Error("le client a change son propre statut");
    return "refuse";
  });

  await etape("le depot previent l'etablissement par son canal", async () => {
    const client = await creerCompte();
    const lieu = await creerLieu();
    await deposer(client, lieu);

    const avis = (
      await c.query(
        `select channel, destination from public.notification_outbox
          where event like 'lead_%' order by created_at desc limit 1`
      )
    ).rows[0];
    if (!avis) throw new Error("aucun avis depose");
    if (avis.channel !== "whatsapp") throw new Error(`canal ${avis.channel}`);
    return `${avis.channel} -> ${avis.destination}`;
  });

  await etape("une demande survit a la suppression de la fiche", async () => {
    // La cle etrangere est en ON DELETE SET NULL : la demande reste, sans son
    // lieu. L'ecran l'affiche alors sans nom d'etablissement plutot que de la
    // perdre, car le client se souvient de ce qu'il a demande, et un litige
    // eventuel porte sur la demande, pas sur la fiche.
    const client = await creerCompte();
    const lieu = await creerLieu();
    const id = await deposer(client, lieu);
    await c.query(`delete from public.places where id = $1`, [lieu]);

    const lignes = await lireSous(client, `select id from public.leads where id = $1`, [id]);
    if (lignes.length !== 1) throw new Error("la demande a disparu avec le lieu");
    const orpheline = (
      await c.query(`select place_id from public.leads where id = $1`, [id])
    ).rows[0];
    if (orpheline.place_id !== null) throw new Error("le lien au lieu subsiste");
    return "conservee, sans lieu";
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
