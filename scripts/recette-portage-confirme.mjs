/**
 * Recette du portage confirme.
 *
 * Le porteur marquait « envoye » des que pg_net acceptait la requete, avant
 * toute reponse de Twilio. Un refus passait donc pour un envoi. Cette recette
 * fabrique les trois reponses possibles et verifie que la file dit la verite.
 *
 * Contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-portage-confirme.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette du portage"));
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
      [`portage-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

/**
 * Une ligne deja remise au transporteur, en attente de confirmation, et la
 * reponse que pg_net aurait conservee pour elle.
 */
const ligneRemise = async ({ statut, contenu, erreur = null, remiseIlYa = "1 minute" }) => {
  const uid = await creerCompte();
  const requete = (
    await c.query(
      `insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg, created)
       values ((select coalesce(max(id), 0) + 1 from net._http_response), $1, 'application/json',
               '{}'::jsonb, $2, false, $3, now())
       returning id`,
      [statut, contenu, erreur]
    )
  ).rows[0].id;

  const ligne = (
    await c.query(
      `insert into public.notification_outbox
         (user_id, channel, event, subject, body, state, attempts, destination,
          request_id, sent_at, created_at)
       values ($1, 'whatsapp', 'recette', 'Sujet de recette', 'Corps de recette',
               'sent', 1, '+2250700000000', $2, now() - $3::interval, now() - $3::interval)
       returning id`,
      [uid, requete, remiseIlYa]
    )
  ).rows[0].id;

  return ligne;
};

const etat = async (id) =>
  (
    await c.query(
      `select state::text, confirme_le, code_reponse, last_error, request_id
         from public.notification_outbox where id = $1`,
      [id]
    )
  ).rows[0];

try {
  await etape("une réponse acceptée confirme la remise", async () => {
    const id = await ligneRemise({ statut: 201, contenu: '{"sid":"SM0000","status":"queued"}' });
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (l.state !== "sent") throw new Error(`etat ${l.state}`);
    if (!l.confirme_le) throw new Error("la remise n'a pas ete confirmee");
    if (l.code_reponse !== 201) throw new Error(`code ${l.code_reponse}`);
    if (l.last_error) throw new Error(`un motif d'erreur subsiste : ${l.last_error}`);
    return "confirmee, code 201";
  });

  await etape("un refus franc de Twilio devient un échec, avec son motif", async () => {
    // C'est exactement la reponse que la base a deja conservee : le porteur la
    // comptait comme un envoi reussi.
    const id = await ligneRemise({
      statut: 400,
      contenu:
        '{"code":21604,"message":"A \'To\' phone number is required.","status":400}',
    });
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (l.state !== "failed") throw new Error(`etat ${l.state}, attendu failed`);
    if (!l.last_error || !l.last_error.includes("phone number is required")) {
      throw new Error(`motif perdu : ${l.last_error}`);
    }
    return l.last_error.slice(0, 50);
  });

  await etape("un débit dépassé remet le message dans la file", async () => {
    // Le destinataire n'y est pour rien : ce message merite une nouvelle
    // chance, pas un abandon definitif.
    const id = await ligneRemise({
      statut: 429,
      contenu: '{"code":63018,"message":"Rate limit exceeded","status":429}',
    });
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (l.state !== "pending") throw new Error(`etat ${l.state}, attendu pending`);
    if (l.request_id !== null) throw new Error("l'ancienne requete reste attachee");
    if (l.confirme_le) throw new Error("une reprise ne se confirme pas");
    return "remis en attente";
  });

  await etape("une panne du transporteur donne droit à une reprise", async () => {
    const id = await ligneRemise({ statut: 503, contenu: "Service Unavailable" });
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (l.state !== "pending") throw new Error(`etat ${l.state}, attendu pending`);
    return "remis en attente";
  });

  await etape("une remise récente sans réponse reste en suspens", async () => {
    // Twilio n'a pas encore repondu : conclure maintenant serait conclure trop
    // tot, et un envoi correct passerait pour un echec.
    const uid = await creerCompte();
    const id = (
      await c.query(
        `insert into public.notification_outbox
           (user_id, channel, event, subject, body, state, attempts, destination,
            request_id, sent_at, created_at)
         values ($1, 'whatsapp', 'recette', 'Sujet', 'Corps', 'sent', 1,
                 '+2250700000000', 999999999, now(), now())
         returning id`,
        [uid]
      )
    ).rows[0].id;
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (l.confirme_le) throw new Error("conclu sans reponse");
    if (l.state !== "sent") throw new Error(`etat ${l.state}`);
    return "laissee en suspens";
  });

  await etape("une remise trop vieille sans réponse est déclarée invérifiable", async () => {
    // pg_net a purge la reponse : personne ne saura jamais. Le dire vaut mieux
    // que de laisser la ligne passer pour un envoi reussi.
    const uid = await creerCompte();
    const id = (
      await c.query(
        `insert into public.notification_outbox
           (user_id, channel, event, subject, body, state, attempts, destination,
            request_id, sent_at, created_at)
         values ($1, 'whatsapp', 'recette', 'Sujet', 'Corps', 'sent', 1,
                 '+2250700000000', 999999998, now() - interval '48 hours',
                 now() - interval '48 hours')
         returning id`,
        [uid]
      )
    ).rows[0].id;
    await c.query(`select public.whatsapp_reconcilier(50)`);
    const l = await etat(id);
    if (!l.confirme_le) throw new Error("laissee indefiniment en suspens");
    if (!l.last_error || !l.last_error.includes("non confirm")) {
      throw new Error(`motif : ${l.last_error}`);
    }
    return l.last_error.slice(0, 45);
  });

  await etape("la cadence ne se règle pas sans le droit", async () => {
    const uid = await creerCompte();
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    let msg = "";
    try {
      await c.query(`select public.whatsapp_regler(1, 5)`);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (!msg) throw new Error("un compte ordinaire a change la cadence");
    return "refuse";
  });

  await etape("l'exploitation règle la cadence, et c'est tracé", async () => {
    const admin = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`,
      [admin]
    );
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: admin, role: "authenticated" }),
    ]);
    await c.query(`select public.whatsapp_regler(1.5, 40)`);
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    const r = (
      await c.query(
        `select secondes_entre_envois, lot_max from public.whatsapp_reglages where unique_ligne`
      )
    ).rows[0];
    if (Number(r.secondes_entre_envois) !== 1.5) throw new Error(`cadence ${r.secondes_entre_envois}`);
    if (r.lot_max !== 40) throw new Error(`lot ${r.lot_max}`);
    const trace = (
      await c.query(
        `select count(*)::int n from public.audit_logs where action = 'whatsapp_regler' and actor_id = $1`,
        [admin]
      )
    ).rows[0].n;
    if (trace === 0) throw new Error("aucune trace");
    await c.query("rollback to savepoint etape");
    return "1,5 s et lot de 40, trace";
  });

  await etape("le lot demandé ne dépasse jamais le lot réglé", async () => {
    // Le travail planifie demande trente. Le reglage en autorise vingt : c'est
    // le reglage qui doit gagner, sans quoi il ne servirait a rien.
    const source = (
      await c.query(
        `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'whatsapp_porter_la_file'`
      )
    ).rows[0].prosrc;
    if (!source.includes("LEAST(")) throw new Error("le lot regle ne borne pas la demande");
    return "borne par LEAST";
  });

  await etape("la santé distingue remis et confirmé", async () => {
    const admin = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`,
      [admin]
    );
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: admin, role: "authenticated" }),
    ]);
    const s = (await c.query(`select public.whatsapp_sante() s`)).rows[0].s;
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    for (const clef of ["remis", "confirmes", "sans_confirmation", "reconciliation_active", "cadence_secondes"]) {
      if (!(clef in s)) throw new Error(`la sante ne rend pas « ${clef} »`);
    }
    if (s.reconciliation_active !== true) throw new Error("la reconciliation n'est pas planifiee");
    await c.query("rollback to savepoint etape");
    return "remis, confirmes, sans confirmation";
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
