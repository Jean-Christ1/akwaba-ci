import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

/** Ce que chaque ecran de la console demande pour s'ouvrir. */
const ECRANS = [
  ["Suivi des courses", "courses.lire"],
  ["Dossiers shopper", "shoppers.lire"],
  ["Pieces d'identite", "shoppers.identite.lire"],
  ["Litiges", "litiges.lire"],
  ["Retraits", "retraits.approuver"],
  ["Parametres et baremes", "bareme.publier"],
  ["Droits d'acces", "roles.attribuer"],
  ["Sante exploitation", "exploitation.sante"],
  ["Moderation des lieux", "lieux.moderer"],
  ["Recherche utilisateurs", "utilisateurs.lire"],
];

const c = new pg.Client(exigerConfiguration("matrice de la console"));
await c.connect();
await c.query("begin");

const roles = (await c.query(`select code, libelle from public.staff_roles order by position`)).rows;
const comptes = new Map();
let i = 0;
for (const r of roles) {
  i++;
  const uid = (await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
       email_change, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', $1::text, '', now(), '', '', '', '', now(), now()) returning id`,
    [`console-${i}@exemple.test`]
  )).rows[0].id;
  await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, $2)`, [uid, r.code]);
  comptes.set(r.code, { uid, libelle: r.libelle });
}

const entete = ["Ecran".padEnd(24), ...roles.map((r) => r.code.slice(0, 9).padEnd(10))].join("");
console.log(entete);
console.log("-".repeat(entete.length));

for (const [nom, droit] of ECRANS) {
  const cases = [];
  for (const r of roles) {
    const ok = (await c.query(`select public.has_permission($1, $2) v`, [comptes.get(r.code).uid, droit])).rows[0].v;
    cases.push((ok ? "oui" : "non").padEnd(10));
  }
  console.log(nom.padEnd(24) + cases.join(""));
}

console.log("");
for (const r of roles) {
  const n = (await c.query(
    `select count(*)::int n from public.permissions p where public.has_permission($1, p.code)`,
    [comptes.get(r.code).uid]
  )).rows[0].n;
  console.log(`  ${r.libelle.padEnd(28)} ${n} droit(s)`);
}

await c.query("rollback");
await c.end();
