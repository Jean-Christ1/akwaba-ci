/**
 * Sonde : que peut-on ecrire a travers les vues qui contournent la RLS ?
 *
 * Une vue en security_invoker=off s'execute avec les droits de son
 * proprietaire, donc sans les politiques de securite des tables qu'elle lit.
 * Si elle est en plus « auto-modifiable » au sens de PostgreSQL, et que
 * authenticated y possede INSERT, UPDATE ou DELETE, alors elle devient un
 * chemin d'ecriture qui passe a cote de tout ce qui protege la table.
 *
 * Cette sonde ne suppose rien : elle tente l'ecriture et rapporte ce qui
 * arrive. Tout se passe dans une transaction annulee.
 *
 * Usage : node scripts/sonde-vues-privilegiees.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("sonde des vues"));
await c.connect();
await c.query("begin");

const constats = [];

try {
  // --- Inventaire ----------------------------------------------------------
  const vues = (
    await c.query(`
      select c.relname,
             coalesce(array_to_string(c.reloptions, ','), '') opts,
             (select string_agg(distinct g.privilege_type, ',')
                from information_schema.role_table_grants g
               where g.table_name = c.relname and g.grantee = 'authenticated') droits
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
       order by c.relname`)
  ).rows;

  console.log("Vues du schema public :");
  for (const v of vues) {
    const invoker = v.opts.includes("security_invoker=on");
    const ecriture = /INSERT|UPDATE|DELETE/.test(v.droits ?? "");
    const risque = !invoker && ecriture;
    console.log(
      `  ${v.relname.padEnd(26)} ${invoker ? "invoker" : "PROPRIETAIRE"}  ${ecriture ? "ECRITURE" : "lecture"}` +
        (risque ? "   <-- chemin d'ecriture hors RLS" : "")
    );
    if (risque) constats.push(v.relname);
  }

  // --- Un shopper habilite, comme il en existe -----------------------------
  const shopper = (
    await c.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
        email_change, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'sonde-shopper@exemple.test', '', now(), '', '', '', '', now(), now())
      returning id`)
  ).rows[0].id;

  await c.query(
    `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status,
       date_of_birth, id_document_type, id_doc_url, selfie_url)
     values ($1, 'Sonde Shopper', '0700000000', 'Abidjan', 'moto', 'approved',
       '1990-01-01', 'cni', 'u/p.jpg', 'u/s.jpg')`,
    [shopper]
  );

  const client = (
    await c.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
        email_change, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'sonde-client@exemple.test', '', now(), '', '', '', '', now(), now())
      returning id`)
  ).rows[0].id;

  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: client, role: "authenticated" }),
  ]);
  const errand = (
    await c.query(`
      select (public.errand_create(
        'Course sonde', 'grocery'::errand_category, 'Abidjan', null,
        'Adresse sonde', '[{"label":"Riz","qty":1}]'::jsonb, 10000,
        null, 'chat', null, 'cash'::pay_method, 'moto', 'small', 'standard',
        10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
      )).id as id`)
  ).rows[0].id;
  await c.query(`select set_config('request.jwt.claims', null, true)`);

  const montants = async () =>
    (
      await c.query(
        `select service_fee, runner_payout, total_amount, budget_estimate, status::text
           from public.errands where id = $1`,
        [errand]
      )
    ).rows[0];

  const avant = await montants();
  console.log(
    `\nCourse sonde : frais ${avant.service_fee}, gain ${avant.runner_payout}, total ${avant.total_amount}`
  );

  // --- Les tentatives d'ecriture, sous l'identite du shopper ---------------
  const sousShopper = async (sql) => {
    // Un point de reprise par tentative : une ecriture refusee avorte la
    // transaction, et sans lui la sonde s'arreterait a la premiere.
    await c.query("savepoint tentative");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: shopper, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    try {
      const r = await c.query(sql, [errand]);
      await c.query("reset role");
      await c.query("release savepoint tentative");
      await c.query(`select set_config('request.jwt.claims', null, true)`);
      return { ok: true, lignes: r.rowCount };
    } catch (e) {
      await c.query("rollback to savepoint tentative");
      await c.query(`select set_config('request.jwt.claims', null, true)`);
      return { ok: false, message: e.message };
    }
  };

  console.log("\nTentatives d'ecriture a travers open_errands_feed :");

  const tentatives = [
    [
      "relever son propre gain",
      `update public.open_errands_feed set runner_payout = 999999 where id = $1`,
    ],
    [
      "baisser les frais de service",
      `update public.open_errands_feed set service_fee = 1 where id = $1`,
    ],
    [
      "supprimer la course d'un autre",
      `delete from public.open_errands_feed where id = $1`,
    ],
  ];

  for (const [nom, sql] of tentatives) {
    const r = await sousShopper(sql);
    if (r.ok) {
      console.log(`  ${nom.padEnd(34)} ACCEPTE (${r.lignes} ligne(s))  <-- faille`);
      constats.push(`ecriture acceptee : ${nom}`);
    } else {
      console.log(`  ${nom.padEnd(34)} refuse : ${r.message.slice(0, 70)}`);
    }
  }

  const apres = await montants();
  console.log(
    `\nApres tentatives : frais ${apres.service_fee}, gain ${apres.runner_payout}, ` +
      `total ${apres.total_amount}, statut ${apres.status}`
  );
  if (
    apres.service_fee !== avant.service_fee ||
    apres.runner_payout !== avant.runner_payout ||
    apres.total_amount !== avant.total_amount
  ) {
    constats.push("les montants ont bouge");
  }

  // --- La lecture des vues agregees ----------------------------------------
  console.log("\nLecture des vues qui contournent la RLS, par un shopper ordinaire :");
  for (const v of ["notification_health"]) {
    const r = await sousShopper(`select count(*)::int n from public.${v} where $1 is not null`);
    console.log(
      `  ${v.padEnd(26)} ${r.ok ? `lisible (${r.lignes ?? "?"} ligne(s))  <-- portee a verifier` : "refuse"}`
    );
  }
} catch (e) {
  console.error("interrompu :", e.message);
  constats.push("interrompu : " + e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log("\n" + (constats.length === 0 ? "AUCUN CHEMIN D'ECRITURE HORS RLS" : `CONSTATS : ${constats.length}`));
for (const x of constats) console.log("  " + x);
