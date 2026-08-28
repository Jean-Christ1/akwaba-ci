/**
 * Recette de l'immuabilité d'un retrait.
 *
 * Trouvé par l'audit systématique : la politique de modification des demandes
 * de retrait n'avait pas de clause WITH CHECK. Un administrateur pouvait donc
 * réattribuer à lui-même le retrait d'un shopper et en changer le montant, en
 * une seule instruction, sans que le responsable qui approuve ensuite puisse
 * s'en apercevoir.
 *
 * Cette recette reproduit l'attaque exacte, puis vérifie que le travail normal
 * de la console reste possible : une garde qui bloque tout ne protège rien, on
 * la retire au premier incident.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-retraits-immuables.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des retraits"));
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
      [`retrait-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const compteDeVersement = async (uid, numero) =>
  (
    await c.query(
      `insert into public.runner_payout_accounts (user_id, provider, account_number, account_name)
       values ($1, 'wave'::momo_provider, $2::text, 'Titulaire de recette') returning id`,
      [uid, numero]
    )
  ).rows[0].id;

/** Un shopper, son compte, sa demande de retrait, et un administrateur. */
const scene = async () => {
  compteur++;
  const shopper = await creerCompte();
  const compte = await compteDeVersement(shopper, `0700${String(compteur).padStart(6, "0")}`);
  const demande = (
    await c.query(
      `insert into public.payout_requests (user_id, account_id, amount, status)
       values ($1, $2, 50000, 'requested'::payout_status) returning id`,
      [shopper, compte]
    )
  ).rows[0].id;

  const admin = await creerCompte();
  await c.query(`update public.user_roles set role = 'admin' where user_id = $1`, [admin]);

  return { shopper, compte, demande, admin };
};

/** Une écriture directe, sous l'identité et le rôle d'un compte connecté. */
const ecrire = async (uid, requete, parametres = []) => {
  await c.query("savepoint ecriture");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
  try {
    await c.query(requete, parametres);
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    await c.query("release savepoint ecriture");
    return { ok: true };
  } catch (e) {
    await c.query("rollback to savepoint ecriture");
    await c.query(`select set_config('request.jwt.claims', null, true)`).catch(() => {});
    return { ok: false, message: e.message };
  }
};

try {
  await etape("L'ATTAQUE : un administrateur ne redirige plus un retrait vers lui-même", async () => {
    const s = await scene();
    const r = await ecrire(s.admin, `update public.payout_requests set user_id = $1 where id = $2`, [
      s.admin,
      s.demande,
    ]);
    if (r.ok) throw new Error("LE RETRAIT A CHANGE DE BENEFICIAIRE");
    if (!sansAccent(r.message).includes("ne change pas de beneficiaire")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("il n'en change pas non plus le montant", async () => {
    const s = await scene();
    const r = await ecrire(s.admin, `update public.payout_requests set amount = 500000 where id = $1`, [
      s.demande,
    ]);
    if (r.ok) throw new Error("le montant a été décuplé");
    if (!sansAccent(r.message).includes("ne se corrige pas")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("ni le compte de destination", async () => {
    // Le piège de la première vérification : réécrire la même valeur ne change
    // rien, et le contrôle passait sans rien prouver. Il faut un autre compte.
    const s = await scene();
    const complice = await creerCompte();
    const autreCompte = await compteDeVersement(complice, "0788999888");
    const r = await ecrire(
      s.admin,
      `update public.payout_requests set account_id = $1 where id = $2`,
      [autreCompte, s.demande]
    );
    if (r.ok) throw new Error("LE VERSEMENT A CHANGE DE DESTINATION");
    if (!sansAccent(r.message).includes("compte de destination")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("le shopper lui-même ne se paie pas davantage", async () => {
    // Deux refus valent ici : la politique ne le laisse toucher aucune ligne,
    // et la garde refuserait de toute facon. Compter sur le seul message
    // d'erreur serait lire de travers : zero ligne modifiee est un refus, pas
    // un succes silencieux.
    const s = await scene();
    await ecrire(s.shopper, `update public.payout_requests set amount = 500000 where id = $1`, [
      s.demande,
    ]);
    const montant = (
      await c.query(`select amount from public.payout_requests where id = $1`, [s.demande])
    ).rows[0].amount;
    if (Number(montant) !== 50000) throw new Error(`le montant est passé à ${montant}`);
    return "montant inchangé";
  });

  await etape("mais le travail normal de la console passe", async () => {
    // Une garde qui bloque tout ne protège rien : on la retire au premier
    // incident. Le statut, la note et la référence de virement restent
    // modifiables, c'est exactement ce que l'écran des retraits met à jour.
    const s = await scene();
    const r = await ecrire(
      s.admin,
      `update public.payout_requests
          set status = 'processing'::payout_status,
              admin_note = 'Virement en cours de preparation',
              transfer_reference = 'WAVE-2026-0001'
        where id = $1`,
      [s.demande]
    );
    if (!r.ok) throw new Error(r.message);
    const l = (
      await c.query(
        `select status::text, admin_note, transfer_reference from public.payout_requests where id = $1`,
        [s.demande]
      )
    ).rows[0];
    if (l.status !== "processing") throw new Error(`statut ${l.status}`);
    if (!l.transfer_reference) throw new Error("la référence n'est pas enregistrée");
    return "statut, note et référence mis à jour";
  });

  await etape("un retrait déjà versé ne se rouvre pas", async () => {
    // Le rouvrir permettrait de le verser deux fois, et la seconde fois ne
    // laisserait aucune trace de la première.
    const s = await scene();
    await c.query(`update public.payout_requests set status = 'paid' where id = $1`, [s.demande]);
    const r = await ecrire(
      s.admin,
      `update public.payout_requests set status = 'requested'::payout_status where id = $1`,
      [s.demande]
    );
    if (r.ok) throw new Error("un retrait versé a été rouvert");
    if (!sansAccent(r.message).includes("ne se rouvre pas")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("un compte ordinaire ne touche à aucun retrait", async () => {
    const s = await scene();
    const quidam = await creerCompte();
    const r = await ecrire(
      quidam,
      `update public.payout_requests set status = 'paid'::payout_status where id = $1`,
      [s.demande]
    );
    const apres = (
      await c.query(`select status::text from public.payout_requests where id = $1`, [s.demande])
    ).rows[0].status;
    if (apres !== "requested") throw new Error(`un quidam a mis le retrait à ${apres}`);
    if (!r.ok) return "refuse";
    return "sans effet";
  });

  await etape("la matrice suffit désormais à traiter un retrait", async () => {
    // Un responsable financier a qui l'on confie « retraits.approuver » sans
    // role herite pouvait lire les retraits et pas les traiter, ce qui n'avait
    // aucun sens.
    const s = await scene();
    const financier = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_finance')`,
      [financier]
    );
    const peut = (
      await c.query(`select public.has_permission($1, 'retraits.approuver') a`, [financier])
    ).rows[0].a;
    if (!peut) throw new Error("le rôle n'ouvre pas retraits.approuver");

    const r = await ecrire(
      financier,
      `update public.payout_requests set status = 'processing'::payout_status where id = $1`,
      [s.demande]
    );
    if (!r.ok) throw new Error(r.message);
    return "traité par la matrice seule";
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
