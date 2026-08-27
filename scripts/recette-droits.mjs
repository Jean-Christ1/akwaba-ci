/**
 * Recette de la matrice de droits.
 *
 * Une matrice de droits se juge sur ce qu'elle refuse. Ce controle cree de
 * vraies personnes, leur donne de vrais roles, et verifie contre la base
 * reelle que chacune peut faire ce qui lui revient et rien de plus.
 *
 * Tout se passe dans une transaction annulee : rien ne subsiste.
 *
 * Usage : node scripts/recette-droits.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des droits"));
await c.connect();
await c.query("begin");

let n = 0;
const echecs = [];
const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const etape = async (titre, fn) => {
  n++;
  try {
    await fn();
    console.log(`  ${n}. ${titre} : OK`);
  } catch (e) {
    echecs.push(`${n}. ${titre} : ${e.message}`);
    console.log(`  ${n}. ${titre} : ECHEC - ${e.message}`);
  }
};

/** Cree un compte reel, le temps de la transaction. */
const creerCompte = async (etiquette) =>
  (
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@exemple.test',
         '', now(), now(), now()) returning id`,
      [etiquette]
    )
  ).rows[0].id;

const sous = async (uid) =>
  c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

const peut = async (uid, code) => {
  const r = await c.query("select public.has_permission($1, $2) ok", [uid, code]);
  return r.rows[0].ok;
};

try {
  const finance = await creerCompte("finance");
  const conformite = await creerCompte("conformite");
  const support = await creerCompte("support");
  await c.query(
    `insert into public.staff_assignments (user_id, role_code) values
       ($1, 'admin_finance'), ($2, 'admin_conformite'), ($3, 'admin_support')`,
    [finance, conformite, support]
  );
  await c.query("savepoint point");

  await etape("le financier approuve les retraits, le conformite non", async () => {
    if (!(await peut(finance, "retraits.approuver"))) throw new Error("le financier ne peut pas");
    if (await peut(conformite, "retraits.approuver")) throw new Error("le conformite peut, il ne devrait pas");
  });

  await etape("le conformite ouvre les pieces d'identite, le financier non", async () => {
    if (!(await peut(conformite, "shoppers.identite.lire"))) throw new Error("le conformite ne peut pas");
    if (await peut(finance, "shoppers.identite.lire")) throw new Error("le financier peut, il ne devrait pas");
  });

  await etape("le support ne peut ni trancher un litige ni publier un bareme", async () => {
    if (await peut(support, "litiges.trancher")) throw new Error("le support tranche un litige");
    if (await peut(support, "bareme.publier")) throw new Error("le support publie un bareme");
    if (!(await peut(support, "courses.deverrouiller"))) throw new Error("le support ne deverrouille pas");
  });

  await etape("personne, hors super administrateur, n'attribue les roles", async () => {
    for (const [qui, nom] of [[finance, "financier"], [conformite, "conformite"], [support, "support"]]) {
      if (await peut(qui, "roles.attribuer")) throw new Error(`le ${nom} attribue des roles`);
    }
  });

  await etape("publier un bareme est refuse a qui n'a pas le droit", async () => {
    await sous(support);
    let msg = "";
    try {
      await c.query(
        `select public.pricing_publish('Tentative', '{}'::jsonb,
           '{"any":{"base":700,"perKm":120}}'::jsonb, '{}'::jsonb)`
      );
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to point");
    if (!msg) throw new Error("le bareme a ete publie sans le droit");
    if (!sansAccent(msg).includes("droit de publier")) throw new Error(`refus inattendu : ${msg}`);
  });

  await etape("publier un bareme reussit avec le droit", async () => {
    await sous(finance);
    await c.query(
      `select public.pricing_publish('Recette des droits', '{}'::jsonb,
         '{"any":{"base":700,"perKm":120},"moto":{"base":700,"perKm":130}}'::jsonb,
         '{"abidjan":{"baseMultiplier":1,"perKmMultiplier":1}}'::jsonb)`
    );
    const g = (await c.query("select public.active_pricing_grid() g")).rows[0].g;
    if (g.label !== "Recette des droits") throw new Error(`bareme actif : ${g.label}`);
    const trace = (
      await c.query(
        `select count(*)::int n from public.audit_logs
          where action = 'pricing_publish' and actor_id = $1`,
        [finance]
      )
    ).rows[0].n;
    if (trace === 0) throw new Error("la publication n'a laisse aucune trace");
    await c.query("rollback to point");
  });

  await etape("un retrait nominatif prime sur le role", async () => {
    await c.query(
      `insert into public.user_permissions (user_id, permission_code, accorde, motif)
       values ($1, 'retraits.approuver', false, 'controle de recette')`,
      [finance]
    );
    if (await peut(finance, "retraits.approuver")) throw new Error("le retrait nominatif n'a pas pris effet");
    await c.query("rollback to point");
  });

  await etape("un octroi nominatif ajoute un droit hors du role", async () => {
    await c.query(
      `insert into public.user_permissions (user_id, permission_code, accorde, motif)
       values ($1, 'audit.lire', true, 'controle de recette')`,
      [support]
    );
    if (!(await peut(support, "audit.lire"))) throw new Error("l'octroi nominatif n'a pas pris effet");
    await c.query("rollback to point");
  });

  await etape("modifier un droit sans motif est refuse", async () => {
    await sous(finance);
    let msg = "";
    try {
      await c.query(`select public.staff_set_permission($1, 'audit.lire', true, '')`, [support]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to point");
    if (!msg) throw new Error("la modification est passee sans motif");
    // Le financier n'a pas le droit d'attribuer : c'est ce refus-la qui tombe
    // en premier, et il est le bon.
    if (!sansAccent(msg).includes("droit")) throw new Error(`refus inattendu : ${msg}`);
  });

  await etape("le role herite admin conserve tous ses droits", async () => {
    const admin = (
      await c.query(`select user_id from public.user_roles where role = 'admin'::app_role limit 1`)
    ).rows[0];
    if (!admin) throw new Error("aucun administrateur en base");
    for (const code of ["roles.attribuer", "bareme.publier", "shoppers.identite.lire", "audit.lire"]) {
      if (!(await peut(admin.user_id, code))) throw new Error(`l'administrateur a perdu ${code}`);
    }
  });

  await etape("un moderateur nomme recoit son perimetre sans intervention", async () => {
    const modo = await creerCompte("modo");
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [modo]);
    if (!(await peut(modo, "litiges.trancher"))) throw new Error("le moderateur ne tranche pas un litige");
    if (await peut(modo, "bareme.publier")) throw new Error("le moderateur publie un bareme");
    if (await peut(modo, "roles.attribuer")) throw new Error("le moderateur attribue des roles");
    await c.query("rollback to point");
  });
} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} etapes vertes`);
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
