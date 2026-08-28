/**
 * Recette des modes de course administrables.
 *
 * Fermer une categorie doit la fermer, pas seulement la masquer dans le
 * formulaire : un appel direct la rouvrirait. Cette recette ferme, puis tente
 * de publier quand meme.
 *
 * Contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-modes-de-course.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des modes"));
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
      [`mode-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const publier = async (uid, categorie = "grocery", ville = "Abidjan", mode = "customer_advance") => {
  // Un point de reprise autour de la publication : un refus avorte la
  // transaction, et sans lui tout ce qui suit echoue pour une cause etrangere.
  await c.query("savepoint publication");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  try {
    const r = await c.query(
      `select (public.errand_create(
         'Course de recette mode', $1::errand_category, $2, null,
         'Adresse de recette', '[{"label":"Riz","qty":1}]'::jsonb, 10000,
         null, 'chat', null, 'cash'::pay_method, 'moto', 'small', 'standard',
         10, 45, 'runner_delivers'::dropoff_mode, null, $3::fund_mode
       )).id as id`,
      [categorie, ville, mode]
    );
    await c.query("release savepoint publication");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    await c.query("rollback to savepoint publication");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    return { ok: false, message: e.message };
  }
};

try {
  await etape("les dix catégories sont ouvertes au départ", async () => {
    const r = await c.query(`select * from public.service_modes_ouverts('Abidjan')`);
    if (r.rows.length !== 10) throw new Error(`${r.rows.length} categorie(s) ouvertes`);
    return `${r.rows.length} ouvertes`;
  });

  await etape("une catégorie fermée disparaît du catalogue", async () => {
    await c.query(`update public.service_modes set actif = false where code = 'gas'`);
    const r = await c.query(`select code from public.service_modes_ouverts('Abidjan')`);
    if (r.rows.some((x) => x.code === "gas")) throw new Error("le gaz reste propose");
    if (r.rows.length !== 9) throw new Error(`${r.rows.length} categorie(s)`);
    await c.query("rollback to savepoint etape");
    return "9 ouvertes";
  });

  await etape("fermer une catégorie la ferme réellement, pas seulement à l'écran", async () => {
    // Le formulaire ne la proposera plus, mais un appel direct le pourrait.
    const uid = await creerCompte();
    await c.query(`update public.service_modes set actif = false where code = 'gas'`);
    const r = await publier(uid, "gas");
    await c.query("rollback to savepoint etape");
    if (r.ok) throw new Error("une course a ete publiee dans une categorie fermee");
    if (!sansAccent(r.message).includes("ne sont pas ouvertes")) {
      throw new Error(`refus inattendu : ${r.message}`);
    }
    return r.message.slice(0, 60);
  });

  await etape("une catégorie peut être fermée dans une seule ville", async () => {
    const uid = await creerCompte();
    await c.query(
      `insert into public.service_mode_cities (mode_code, city_slug, actif)
       values ('market', 'abidjan', false)`
    );
    const aAbidjan = await publier(uid, "market", "Abidjan");
    await c.query("rollback to savepoint etape");
    if (aAbidjan.ok) throw new Error("publie a Abidjan alors que le marche y est ferme");
    if (!sansAccent(aAbidjan.message).includes("abidjan")) {
      throw new Error(`le refus ne nomme pas la ville : ${aAbidjan.message}`);
    }
    return aAbidjan.message.slice(0, 60);
  });

  await etape("la même catégorie reste ouverte ailleurs", async () => {
    const uid = await creerCompte();
    await c.query(
      `insert into public.service_mode_cities (mode_code, city_slug, actif)
       values ('market', 'korhogo', false)`
    );
    const aAbidjan = await publier(uid, "market", "Abidjan");
    await c.query("rollback to savepoint etape");
    if (!aAbidjan.ok) throw new Error(`refuse a Abidjan : ${aAbidjan.message}`);
    return "ouverte a Abidjan, fermee a Korhogo";
  });

  await etape("un mode de règlement non autorisé est refusé", async () => {
    // Un colis n'a pas d'achat a financer : proposer une avance n'aurait pas
    // de sens, et le client se demanderait quoi envoyer.
    const uid = await creerCompte();
    const r = await publier(uid, "parcel", "Abidjan", "customer_advance");
    await c.query("rollback to savepoint etape");
    if (r.ok) throw new Error("une avance a ete acceptee sur un retrait de colis");
    if (!sansAccent(r.message).includes("mode de reglement")) {
      throw new Error(`refus inattendu : ${r.message}`);
    }
    return r.message.slice(0, 60);
  });

  await etape("le mode autorisé, lui, passe", async () => {
    const uid = await creerCompte();
    const r = await publier(uid, "parcel", "Abidjan", "on_delivery");
    if (!r.ok) throw new Error(`refuse alors que le mode est autorise : ${r.message}`);
    return "accepte";
  });

  await etape("régler un service demande le droit correspondant", async () => {
    const uid = await creerCompte();
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    let msg = "";
    try {
      await c.query(`select public.service_mode_regler('gas', false)`);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (!msg) throw new Error("un compte ordinaire a ferme un service");
    if (!sansAccent(msg).includes("droit")) throw new Error(`refus inattendu : ${msg}`);
    return "refuse";
  });

  await etape("le personnel habilité règle, et c'est tracé", async () => {
    const admin = await creerCompte();
    await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`, [admin]);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: admin, role: "authenticated" }),
    ]);
    await c.query(
      `select public.service_mode_regler('gas', false, array['on_delivery'], null, array['korhogo'])`
    );
    await c.query(`select set_config('request.jwt.claims', null, true)`);

    const mode = (
      await c.query(`select actif, modes_financement from public.service_modes where code = 'gas'`)
    ).rows[0];
    if (mode.actif) throw new Error("le service n'a pas ete ferme");
    if (mode.modes_financement.length !== 1) throw new Error("les modes n'ont pas ete restreints");

    const trace = (
      await c.query(
        `select count(*)::int n from public.audit_logs
          where action = 'service_mode_regler' and actor_id = $1`,
        [admin]
      )
    ).rows[0].n;
    if (trace === 0) throw new Error("le reglage n'a laisse aucune trace");
    await c.query("rollback to savepoint etape");
    return "ferme, restreint, trace";
  });

  await etape("la liste des villes fermées remplace la précédente", async () => {
    // C'est un etat, pas une suite d'ajouts : raisonner par ajouts laisserait
    // des fermetures oubliees que personne ne retrouverait.
    const admin = await creerCompte();
    await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`, [admin]);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: admin, role: "authenticated" }),
    ]);
    await c.query(`select public.service_mode_regler('market', true, null, null, array['korhogo','bouake'])`);
    await c.query(`select public.service_mode_regler('market', true, null, null, array['korhogo'])`);
    await c.query(`select set_config('request.jwt.claims', null, true)`);

    const fermees = (
      await c.query(`select city_slug from public.service_mode_cities where mode_code = 'market'`)
    ).rows.map((r) => r.city_slug);
    await c.query("rollback to savepoint etape");
    if (fermees.length !== 1 || fermees[0] !== "korhogo") {
      throw new Error(`villes fermees : ${fermees.join(", ")}`);
    }
    return "une seule, la derniere donnee";
  });

  await etape("le catalogue est lisible par un visiteur non connecté", async () => {
    await c.query("set local role anon");
    const r = await c.query(`select count(*)::int n from public.service_modes_ouverts('Abidjan')`);
    await c.query("reset role");
    if (Number(r.rows[0].n) === 0) throw new Error("un visiteur ne voit aucune categorie");
    return `${r.rows[0].n} categorie(s) visibles`;
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
