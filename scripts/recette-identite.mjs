/**
 * Recette de la verification d'identite du shopper.
 *
 * Contre la vraie base, dans une transaction annulee. Chaque etape doit
 * echouer pour la bonne raison, ou reussir : une garde qui ne peut pas
 * refuser n'est pas une garde.
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette identite"));
await c.connect();
await c.query("begin");

let n = 0, echecs = [];
const etape = async (titre, fn) => {
  n++;
  try { await fn(); console.log(`  ${n}. ${titre} : OK`); }
  catch (e) { echecs.push(`${n}. ${titre} : ${e.message}`); console.log(`  ${n}. ${titre} : ECHEC - ${e.message}`); }
};
/** Comparer sans accents : le message porte les siens, pas le motif attendu. */
const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const refuse = async (sql, params, motif) => {
  let accepte = false;
  try { await c.query(sql, params); accepte = true; }
  catch (e) {
    // La transaction est avortee des qu'une exception est levee : il faut
    // revenir au point de reprise avant toute autre commande, y compris
    // avant de decider si le refus etait le bon.
    await c.query("rollback to point");
    if (!sansAccent(e.message).includes(sansAccent(motif)))
      throw new Error(`refuse pour une autre raison : ${e.message}`);
    return;
  }
  if (accepte) throw new Error("accepte alors que cela devait etre refuse");
};

try {
  // Un candidat reel, cree pour l'epreuve puis annule.
  const uid = (await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'recette-identite-' || gen_random_uuid() || '@exemple.test',
       '', now(), now(), now()) returning id`)).rows[0].id;
  await c.query(
    `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status)
     values ($1, 'Candidat Recette', '0700000000', 'Abidjan', 'moto', 'pending')`, [uid]);

  // Le point de reprise se pose APRES la creation du candidat. Pose avant,
  // chaque refus l'effacait, et l'etape suivante echouait sur une cause qui
  // n'avait rien a voir avec ce qu'elle voulait eprouver.
  await c.query("savepoint point");

  const commeCandidat = async (sql, params = []) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    return c.query(sql, params);
  };

  await etape("un mineur ne peut pas deposer son dossier", async () => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await refuse(
      `select public.runner_submit_identity($1::date, 'cni', null, 'u/piece.jpg', 'u/selfie.jpg')`,
      [new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10)],
      "dix-huit ans");
  });

  await etape("un dossier sans selfie est refuse", async () => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await refuse(
      `select public.runner_submit_identity('1990-01-01'::date, 'cni', null, 'u/piece.jpg', '')`,
      [], "selfie");
  });

  await etape("une piece perimee est refusee", async () => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await refuse(
      `select public.runner_submit_identity('1990-01-01'::date, 'cni', '2020-01-01'::date, 'u/p.jpg', 'u/s.jpg')`,
      [], "perimee");
  });

  await etape("un dossier complet et majeur est accepte", async () => {
    await commeCandidat(
      `select public.runner_submit_identity('1990-01-01'::date, 'cni', '2030-01-01'::date, 'u/p.jpg', 'u/s.jpg')`);
    const r = (await c.query(
      `select date_of_birth, selfie_url, identity_submitted_at, status
         from public.runner_profiles where user_id = $1`, [uid])).rows[0];
    if (!r.selfie_url || !r.identity_submitted_at) throw new Error("le depot n'a rien enregistre");
    if (r.status !== "pending") throw new Error(`statut ${r.status} au lieu de pending`);
  });

  // Le coeur du sujet : la validation ne doit plus dependre de l'attention du
  // moderateur. Un dossier vide doit etre refuse par le serveur lui-meme.
  const modo = (await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'recette-modo-' || gen_random_uuid() || '@exemple.test',
       '', now(), now(), now()) returning id`)).rows[0].id;
  await c.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [modo]);
  const commeModo = async (sql, params = []) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: modo, role: "authenticated" })]);
    return c.query(sql, params);
  };
  const vide = (await c.query(
    `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status)
     values ($1, 'Dossier Vide', '0700000001', 'Abidjan', 'moto', 'pending') returning id`,
    [(await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'recette-vide-' || gen_random_uuid() || '@exemple.test',
         '', now(), now(), now()) returning id`)).rows[0].id])).rows[0].id;

  // Nouveau point de reprise, apres la creation du dossier vide : sinon le
  // premier refus l'effacerait et les etapes suivantes s'en prendraient a un
  // dossier qui n'existe plus.
  await c.query("release savepoint point");
  await c.query("savepoint point");

  await etape("un moderateur ne peut pas valider un dossier sans identite", async () => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: modo, role: "authenticated" })]);
    await refuse(`select public.runner_set_status($1, 'approved')`, [vide], "il manque");
  });

  await etape("le refus nomme precisement ce qui manque", async () => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: modo, role: "authenticated" })]);
    let msg = "";
    try { await c.query(`select public.runner_set_status($1, 'approved')`, [vide]); }
    catch (e) { msg = e.message; }
    await c.query("rollback to point");
    for (const attendu of ["date de naissance", "piece", "selfie"]) {
      if (!sansAccent(msg).includes(sansAccent(attendu)))
        throw new Error(`le message ne cite pas "${attendu}" : ${msg}`);
    }
  });

  await etape("la suspension reste possible sans identite, avec motif", async () => {
    await commeModo(`select public.runner_set_status($1, 'suspended', 'controle de recette')`, [vide]);
    const r = (await c.query(`select status from public.runner_profiles where id = $1`, [vide])).rows[0];
    if (r.status !== "suspended") throw new Error(`statut ${r.status}`);
  });

  await etape("la garde peut refuser : sans elle, le dossier vide passerait", async () => {
    // Une garde qu'on ne voit jamais refuser pourrait etre inerte. On la
    // retire, on constate que le dossier vide passe, puis on la remet.
    await c.query("rollback to point");
    await c.query(`create or replace function public.runner_identity_gaps(p_runner public.runner_profiles)
                   returns text[] language sql immutable as $f$ select array[]::text[] $f$`);
    await commeModo(`select public.runner_set_status($1, 'approved')`, [vide]);
    const passe = (await c.query(`select status from public.runner_profiles where id = $1`, [vide])).rows[0].status;
    await c.query("rollback to point");
    if (passe !== "approved") throw new Error("la garde n'etait pas la cause du refus");
  });

} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} etapes vertes`);
if (echecs.length) { for (const e of echecs) console.error("  " + e); process.exit(1); }
