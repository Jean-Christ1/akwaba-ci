/**
 * Recette des portes rendues à la matrice.
 *
 * Quinze politiques et treize fonctions décidaient encore d'un accès en lisant
 * le rôle hérité. Ni la mesure des droits morts ni celle des portées
 * décoratives ne les voyaient : elles cherchent des droits mal branchés, pas
 * des portes qui se passent d'eux.
 *
 * Chaque étape vérifie les deux moitiés. Le droit ouvre, et son absence ferme.
 * Vérifier seulement l'ouverture laisserait passer une porte restée grande
 * ouverte ; vérifier seulement le refus laisserait passer une porte murée, que
 * l'on retirerait au premier incident.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-portes-de-la-matrice.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des portes"));
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
const creerCompte = async () => {
  compteur++;
  return (
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
         email_change, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), '', '', '', '', now(), now())
       returning id`,
      [`portes-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

/**
 * Quelqu'un qui détient exactement un droit, et rien d'autre.
 *
 * Une exception nominative plutôt qu'un rôle : elle isole le droit qu'on
 * éprouve. Avec un rôle, une étape verte ne dirait pas lequel de ses dix-neuf
 * droits a ouvert la porte.
 */
const avecLeDroitDe = async (code) => {
  const uid = await creerCompte();
  await c.query(
    `insert into public.user_permissions (user_id, permission_code, accorde, motif)
     values ($1, $2, true, 'Recette des portes')`,
    [uid, code]
  );
  return uid;
};

const appeler = async (uid, requete, parametres = []) => {
  await c.query("savepoint appel");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
  try {
    const r = await c.query(requete, parametres);
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    await c.query("release savepoint appel");
    return { ok: true, lignes: r.rows, nombre: r.rowCount };
  } catch (e) {
    await c.query("rollback to savepoint appel");
    await c.query(`select set_config('request.jwt.claims', null, true)`).catch(() => {});
    return { ok: false, message: e.message };
  }
};

/** Le droit ouvre, et son absence ferme. Les deux moitiés, toujours. */
const ouvreEtFerme = async (code, requete, parametres = []) => {
  const avec = await appeler(await avecLeDroitDe(code), requete, parametres);
  if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
  if (avec.nombre === 0) throw new Error("le droit n'ouvre rien : aucune ligne");

  const sans = await appeler(await creerCompte(), requete, parametres);
  if (sans.ok && sans.nombre > 0) throw new Error("LA PORTE EST OUVERTE SANS LE DROIT");
  return `${avec.nombre} ligne(s) avec, ${sans.ok ? sans.nombre : "refus"} sans`;
};

const course = async (ville = "Abidjan") => {
  const client = await creerCompte();
  return {
    client,
    id: (
      await c.query(
        `insert into public.errands (customer_id, title, category, city, delivery_address, items, status)
         values ($1, 'Course de recette', 'grocery', $2, 'Adresse', '[]'::jsonb, 'open')
         returning id`,
        [client, ville]
      )
    ).rows[0].id,
  };
};

try {
  await etape("COURSES : les messages d'une course", async () => {
    const e = await course();
    await c.query(
      `insert into public.errand_messages (errand_id, sender_id, body)
       values ($1, $2, 'Message de recette')`,
      [e.id, e.client]
    );
    return ouvreEtFerme(
      "courses.lire",
      `select id from public.errand_messages where errand_id = $1`,
      [e.id]
    );
  });

  await etape("les évènements d'une course", async () => {
    const e = await course();
    // Le journal d'evenements est ecrit par le moteur : on pose la ligne comme
    // il la pose, plutot que d'inventer une forme qui n'existe pas.
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    await c.query(
      `insert into public.errand_events (errand_id, status, note)
       values ($1, 'open'::errand_status, 'Depot de recette')`,
      [e.id]
    );
    await c.query(`select set_config('app.errand_engine', 'off', true)`);
    return ouvreEtFerme(
      "courses.lire",
      `select id from public.errand_events where errand_id = $1`,
      [e.id]
    );
  });

  await etape("une course programmée", async () => {
    const client = await creerCompte();
    const id = (
      await c.query(
        // Un rythme hebdomadaire exige son jour : la contrainte le dit, et
        // sans lui la ligne ne se pose pas.
        `insert into public.errand_schedules (customer_id, label, rhythm, day_of_week, hour_of_day, next_run_at)
         values ($1, 'Courses du samedi', 'weekly'::schedule_rhythm, 6, 9, now() + interval '1 day')
         returning id`,
        [client]
      )
    ).rows[0].id;
    return ouvreEtFerme("courses.lire", `select id from public.errand_schedules where id = $1`, [id]);
  });

  await etape("UTILISATEURS : la fiche d'un compte", async () => {
    const qui = await creerCompte();
    return ouvreEtFerme("utilisateurs.lire", `select id from public.profiles where id = $1`, [qui]);
  });

  await etape("ARGENT : le portefeuille d'un shopper", async () => {
    const shopper = await creerCompte();
    await c.query(
      `insert into public.runner_wallets (user_id, available_balance) values ($1, 12000)
       on conflict (user_id) do update set available_balance = 12000`,
      [shopper]
    );
    return ouvreEtFerme(
      "paiements.lire",
      `select id from public.runner_wallets where user_id = $1`,
      [shopper]
    );
  });

  await etape("les écritures de son portefeuille", async () => {
    const shopper = await creerCompte();
    const e = await course();
    await c.query(
      `insert into public.wallet_entries (user_id, errand_id, kind, amount, label)
       values ($1, $2, 'earning'::wallet_entry_kind, 5000, 'Gain de recette')`,
      [shopper, e.id]
    );
    return ouvreEtFerme(
      "paiements.lire",
      `select id from public.wallet_entries where user_id = $1`,
      [shopper]
    );
  });

  await etape("le parrainage d'un compte", async () => {
    const qui = await creerCompte();
    compteur++;
    await c.query(
      `insert into public.referrals (user_id, code) values ($1, $2)`,
      [qui, `RECETTE${compteur}`]
    );
    return ouvreEtFerme("paiements.lire", `select id from public.referrals where user_id = $1`, [qui]);
  });

  await etape("EXPLOITATION : la file d'envoi", async () => {
    const qui = await creerCompte();
    await c.query(
      `insert into public.notification_outbox (user_id, event, subject, body, channel, destination)
       values ($1, 'recette_portes', 'Sujet', 'Corps', 'email', 'recette@exemple.test')`,
      [qui]
    );
    return ouvreEtFerme(
      "exploitation.sante",
      `select id from public.notification_outbox where event = 'recette_portes'`
    );
  });

  await etape("les tâches planifiées", async () => {
    const avec = await appeler(
      await avecLeDroitDe("exploitation.sante"),
      `select * from public.taches_planifiees()`
    );
    if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
    if (avec.nombre === 0) throw new Error("aucune tâche rendue : la porte ouvre sur le vide");

    const sans = await appeler(await creerCompte(), `select * from public.taches_planifiees()`);
    if (sans.ok && sans.nombre > 0) throw new Error("LES TACHES SONT VISIBLES SANS LE DROIT");
    return `${avec.nombre} tâche(s) avec, rien sans`;
  });

  await etape("ORGANISATIONS : les membres d'une organisation", async () => {
    const fondateur = await creerCompte();
    const org = (
      await appeler(fondateur, `select (public.organisation_create($1)).id as id`, [
        `Organisation de recette ${++compteur}`,
      ])
    ).lignes[0].id;
    return ouvreEtFerme(
      "organisations.lire",
      `select user_id from public.organisation_members where organisation_id = $1`,
      [org]
    );
  });

  await etape("RETRAITS : traiter une demande de retrait", async () => {
    const shopper = await creerCompte();
    const compte = (
      await c.query(
        `insert into public.runner_payout_accounts (user_id, provider, account_number, account_name)
         values ($1, 'wave'::momo_provider, '0700445566', 'Titulaire de recette') returning id`,
        [shopper]
      )
    ).rows[0].id;
    const demande = (
      await c.query(
        `insert into public.payout_requests (user_id, account_id, amount, status)
         values ($1, $2, 30000, 'requested'::payout_status) returning id`,
        [shopper, compte]
      )
    ).rows[0].id;

    const sans = await appeler(
      await creerCompte(),
      `select public.payout_request_settle($1, 'processing'::payout_status, null)`,
      [demande]
    );
    if (sans.ok) throw new Error("un retrait a été traité sans le droit");

    const avec = await appeler(
      await avecLeDroitDe("retraits.approuver"),
      `select public.payout_request_settle($1, 'processing'::payout_status, 'Recette')`,
      [demande]
    );
    if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
    const etat = (
      await c.query(`select status::text from public.payout_requests where id = $1`, [demande])
    ).rows[0].status;
    if (etat !== "processing") throw new Error(`le retrait est resté « ${etat} »`);
    return "traité par le droit seul";
  });

  await etape("LIEUX : le journal de modération d'une fiche", async () => {
    compteur++;
    const lieu = (
      await c.query(
        `insert into public.places (slug, name, type, city, address, description, lat, lng, status, owner_id)
         values ($1, 'Lieu de recette', 'restaurant', 'Abidjan', 'Adresse', 'Fiche',
                 5.35, -4.02, 'pending'::place_status, $2)
         returning id`,
        [`portes-lieu-${compteur}`, await creerCompte()]
      )
    ).rows[0].id;
    await c.query(
      `insert into public.place_moderation_events (place_id, moderator_id, action, note)
       values ($1, $2, 'note', 'Note de recette')`,
      [lieu, await creerCompte()]
    );
    return ouvreEtFerme(
      "lieux.moderer",
      `select id from public.place_moderation_events where place_id = $1`,
      [lieu]
    );
  });

  await etape("VILLES : les quartiers", async () => {
    const modifier = `update public.service_zones set position = position where city_slug = 'abidjan'`;
    const sans = await appeler(await creerCompte(), modifier);
    if (sans.ok && sans.nombre > 0) throw new Error("LES QUARTIERS SONT MODIFIABLES SANS LE DROIT");

    const avec = await appeler(await avecLeDroitDe("villes.gerer"), modifier);
    if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
    if (avec.nombre === 0) throw new Error("aucun quartier touché : la porte est murée");
    return `${avec.nombre} quartier(s) avec, ${sans.ok ? sans.nombre : "refus"} sans`;
  });

  await etape("LITIGES : les montants gelés", async () => {
    const e = await course();
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    await c.query(`update public.errands set status = 'disputed' where id = $1`, [e.id]);
    await c.query(`select set_config('app.errand_engine', 'off', true)`);

    const avec = await appeler(
      await avecLeDroitDe("litiges.lire"),
      `select * from public.dispute_frozen_amounts()`
    );
    if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
    if (avec.nombre === 0) throw new Error("aucun litige rendu : la porte ouvre sur le vide");

    const sans = await appeler(await creerCompte(), `select * from public.dispute_frozen_amounts()`);
    if (sans.ok && sans.nombre > 0) throw new Error("LES LITIGES SONT VISIBLES SANS LE DROIT");
    return `${avec.nombre} litige(s) avec, rien sans`;
  });

  await etape("le tableau de bord d'exploitation", async () => {
    const avec = await appeler(
      await avecLeDroitDe("exploitation.sante"),
      `select public.admin_dashboard(7) as d`
    );
    if (!avec.ok) throw new Error("le droit n'ouvre pas : " + avec.message);
    if (!avec.lignes[0].d) throw new Error("le tableau de bord est vide");

    const sans = await appeler(await creerCompte(), `select public.admin_dashboard(7)`);
    if (sans.ok) throw new Error("LE TABLEAU DE BORD EST LISIBLE SANS LE DROIT");
    return "ouvert par le droit, refusé sans";
  });

  await etape("le catalogue des droits s'ouvre à une exception nominative seule", async () => {
    // Il exigeait un role ou l'acces de secours. Quelqu'un a qui l'on a confie
    // un droit precis, sans role, fait pourtant partie du personnel.
    const avec = await appeler(
      await avecLeDroitDe("courses.lire"),
      `select count(*)::int n from public.catalogue_des_droits()`
    );
    if (!avec.ok) throw new Error(avec.message);
    if (avec.lignes[0].n === 0) throw new Error("le catalogue est vide");

    const sans = await appeler(
      await creerCompte(),
      `select count(*)::int n from public.catalogue_des_droits()`
    );
    if (sans.ok) throw new Error("LE CATALOGUE EST LISIBLE PAR UN COMPTE ORDINAIRE");
    return `${avec.lignes[0].n} droits pour du personnel sans rôle`;
  });

  await etape("plus aucune porte ne regarde le rôle hérité", async () => {
    const restantes = (await c.query(`select genre, objet, detail from public.portes_au_role_herite()`))
      .rows.map((l) => `${l.genre} ${l.objet}${l.detail ? " :: " + l.detail : ""}`);
    if (restantes.length) throw new Error(restantes.join(" ; "));
    return "les exceptions nommées, et rien d'autre";
  });
} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} étapes vertes`);
console.log("(transaction annulée : la base est intacte)");
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
