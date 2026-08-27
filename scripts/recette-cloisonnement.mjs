/**
 * Recette du cloisonnement client, shopper et administration.
 *
 * Une meme personne peut etre cliente et shopper. Son identite est unique, mais
 * ses donnees ne doivent pas se melanger : ses courses en tant que cliente ne
 * sont pas ses missions en tant que shopper, et ni l'une ni l'autre ne lui
 * ouvrent la console.
 *
 * Ce controle cree de vraies personnes, leur donne de vrais roles, et verifie
 * contre la base ce que chacune voit et ce qu'elle ne voit pas.
 *
 * Usage : node scripts/recette-cloisonnement.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette du cloisonnement"));
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
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
         email_change, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), '', '', '', '', now(), now())
       returning id`,
      [`cloison-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const habiliterShopper = async (uid) =>
  c.query(
    `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status,
       date_of_birth, id_document_type, id_doc_url, selfie_url)
     values ($1, 'Shopper Cloison', '0700000000', 'Abidjan', 'moto', 'approved',
       '1990-01-01', 'cni', 'u/p.jpg', 'u/s.jpg')
     on conflict (user_id) do update set status = 'approved'`,
    [uid]
  );

const publier = async (client, budget = 10000) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: client, role: "authenticated" }),
  ]);
  const id = (
    await c.query(
      `select (public.errand_create(
         'Course de cloisonnement', 'grocery'::errand_category, 'Abidjan', null,
         'Adresse de recette', '[{"label":"Riz","qty":1}]'::jsonb, $1,
         null, 'chat', null, 'cash'::pay_method, 'moto', 'small', 'standard',
         10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
       )).id as id`,
      [budget]
    )
  ).rows[0].id;
  await c.query(`select set_config('request.jwt.claims', null, true)`);
  return id;
};

/** Lit sous l'identite donnee, politiques appliquees. */
const lireSous = async (uid, sql, params = []) => {
  await c.query("savepoint lecture");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
  try {
    const r = await c.query(sql, params);
    await c.query("reset role");
    await c.query("release savepoint lecture");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query("rollback to savepoint lecture");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    return { ok: false, message: e.message };
  }
};

try {
  // ------------------------------------------------------------------------
  // Une personne, deux casquettes
  // ------------------------------------------------------------------------

  await etape("une personne peut etre cliente et shopper sous une seule identite", async () => {
    const uid = await creerCompte();
    await habiliterShopper(uid);
    await publier(uid);

    const client = await lireSous(uid, `select count(*)::int n from public.errands where customer_id = $1`, [uid]);
    const shopper = (
      await c.query(`select count(*)::int n from public.runner_profiles where user_id = $1`, [uid])
    ).rows[0].n;
    if (client.rows[0].n !== 1) throw new Error("sa course cliente n'apparait pas");
    if (shopper !== 1) throw new Error("son dossier shopper n'existe pas");
    return "une identite, deux profils";
  });

  await etape("ses courses de cliente ne sont pas ses missions de shopper", async () => {
    // La confusion la plus couteuse : melanger ce qu'on a demande et ce qu'on
    // a accepte de faire pour autrui.
    const uid = await creerCompte();
    await habiliterShopper(uid);
    const sienne = await publier(uid);

    const commeClient = await lireSous(
      uid, `select id from public.errands where customer_id = $1`, [uid]
    );
    const commeShopper = await lireSous(
      uid, `select id from public.errands where runner_id = $1`, [uid]
    );
    if (commeClient.rows.length !== 1) throw new Error("la course cliente manque");
    if (commeShopper.rows.length !== 0) throw new Error("une mission apparait alors qu'il n'en a aucune");
    if (commeClient.rows[0].id !== sienne) throw new Error("ce n'est pas sa course");
    return "1 course cliente, 0 mission";
  });

  await etape("un shopper ne peut pas prendre sa propre course", async () => {
    const uid = await creerCompte();
    await habiliterShopper(uid);
    const sienne = await publier(uid);

    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    let msg = "";
    try {
      await c.query(
        `insert into public.errand_offers (errand_id, runner_id, price, message)
         values ($1, $2, 3000, 'je la prends')`,
        [sienne, uid]
      );
    } catch (e) {
      // La transaction est avortee des l'exception : on revient au point de
      // reprise avant toute autre requete, sinon tout ce qui suit echoue.
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (!msg) throw new Error("il a offert sur sa propre course");
    return msg.slice(0, 60);
  });

  await etape("sa propre course n'apparait pas sur son marche de shopper", async () => {
    // Le marche s'execute hors politique : sa garde tient dans sa clause. Si
    // elle laissait passer la course du shopper lui-meme, il pourrait se
    // l'attribuer et fabriquer des courses fictives.
    const uid = await creerCompte();
    await habiliterShopper(uid);
    const sienne = await publier(uid);

    const marche = await lireSous(uid, `select id from public.open_errands_feed where id = $1`, [sienne]);
    if (!marche.ok) throw new Error(marche.message);
    // Lui montrer sa propre course l'invite a une action que le serveur
    // refusera : c'est une impasse offerte, et sur une liste de missions elle
    // occupe la place d'une vraie.
    if (marche.rows.length !== 0) throw new Error("sa propre course figure sur son marche");
    return "ecartee de son marche";
  });

  // ------------------------------------------------------------------------
  // Ce qu'un shopper ne doit jamais voir
  // ------------------------------------------------------------------------

  await etape("un shopper ne lit pas le portefeuille d'un autre shopper", async () => {
    const a = await creerCompte();
    const b = await creerCompte();
    await habiliterShopper(a);
    await habiliterShopper(b);
    for (const uid of [a, b]) {
      await c.query("savepoint portefeuille");
      try {
        await c.query(`select public.ensure_runner_wallet($1)`, [uid]);
        await c.query("release savepoint portefeuille");
      } catch {
        // Le portefeuille peut deja exister ou la fonction avoir une autre
        // signature : ce n'est pas l'objet de cette etape.
        await c.query("rollback to savepoint portefeuille");
      }
    }

    const vu = await lireSous(b, `select user_id from public.runner_wallets`);
    if (!vu.ok) throw new Error(vu.message);
    const autres = vu.rows.filter((r) => r.user_id !== b);
    if (autres.length > 0) throw new Error(`${autres.length} portefeuille(s) d'autrui visibles`);
    return "seulement le sien";
  });

  await etape("un shopper ne lit pas les pieces d'identite d'un autre", async () => {
    const a = await creerCompte();
    const b = await creerCompte();
    await habiliterShopper(a);
    await habiliterShopper(b);

    const vu = await lireSous(b, `select user_id, id_doc_url from public.runner_profiles`);
    if (!vu.ok) throw new Error(vu.message);
    const fuites = vu.rows.filter((r) => r.user_id !== b && r.id_doc_url);
    if (fuites.length > 0) throw new Error(`${fuites.length} piece(s) d'autrui lisibles`);
    return "aucune fuite";
  });

  await etape("un shopper n'a aucun droit de console", async () => {
    const uid = await creerCompte();
    await habiliterShopper(uid);
    const droits = (
      await c.query(
        `select count(*)::int n from public.permissions p where public.has_permission($1, p.code)`,
        [uid]
      )
    ).rows[0].n;
    if (droits !== 0) throw new Error(`${droits} droit(s) de console pour un simple shopper`);
    return "0 droit";
  });

  await etape("etre client ne donne aucun droit de shopper", async () => {
    // Un compte client ne doit jamais recevoir l'habilitation par le seul fait
    // d'exister : elle se demande et se valide.
    const uid = await creerCompte();
    await publier(uid);
    const habilite = (
      await c.query(`select public.is_approved_runner($1) v`, [uid])
    ).rows[0].v;
    if (habilite) throw new Error("un simple client est habilite comme shopper");

    const marche = await lireSous(uid, `select id from public.open_errands_feed`);
    if (!marche.ok) throw new Error(marche.message);
    if (marche.rows.length !== 0) throw new Error("un client voit le marche des shoppers");
    return "marche ferme au client";
  });

  // ------------------------------------------------------------------------
  // Ce que la console reserve
  // ------------------------------------------------------------------------

  await etape("la sante de la file est reservee au personnel", async () => {
    const shopper = await creerCompte();
    await habiliterShopper(shopper);
    const vu = await lireSous(shopper, `select count(*)::int n from public.notification_health`);
    if (!vu.ok) throw new Error(vu.message);
    if (Number(vu.rows[0].n) !== 0) {
      throw new Error(`un shopper lit ${vu.rows[0].n} ligne(s) de la file`);
    }
    return "invisible pour un shopper";
  });

  await etape("le personnel, lui, lit la sante de la file", async () => {
    const modo = await creerCompte();
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [modo]);
    const vu = await lireSous(modo, `select canal, etat, nombre, abandonnees from public.notification_health`);
    if (!vu.ok) throw new Error(vu.message);
    // La colonne « abandonnees » avait disparu d'une redefinition : l'ecran de
    // sante affichait une erreur au lieu de l'etat de la file.
    return `${vu.rows.length} ligne(s), colonne abandonnees presente`;
  });

  await etape("aucune vue n'accorde plus l'ecriture", async () => {
    const restants = (
      await c.query(`
        select c.relname
          from pg_class c
          join pg_namespace ns on ns.oid = c.relnamespace
         where ns.nspname = 'public' and c.relkind = 'v'
           and exists (
             select 1 from information_schema.role_table_grants g
              where g.table_name = c.relname
                and g.grantee in ('anon', 'authenticated')
                and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))`)
    ).rows;
    if (restants.length > 0) {
      throw new Error(`${restants.map((r) => r.relname).join(", ")} accordent encore l'ecriture`);
    }
    return "toutes en lecture seule";
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
