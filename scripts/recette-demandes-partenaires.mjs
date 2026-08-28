/**
 * Recette du traitement des demandes par l'établissement.
 *
 * Deux choses à prouver, et elles tirent en sens contraire. Le partenaire doit
 * pouvoir répondre à un visiteur qui attend. Et il ne doit pas pouvoir réécrire
 * ce que ce visiteur a écrit, ni déplacer sa demande ailleurs.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-demandes-partenaires.mjs
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
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
         email_change, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), '', '', '', '', now(), now())
       returning id`,
      [`demande-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const commeSi = (uid) =>
  c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
const anonyme = () => c.query(`select set_config('request.jwt.claims', null, true)`);

const essayer = async (uid, requete, parametres = []) => {
  await c.query("savepoint tentative");
  await commeSi(uid);
  try {
    const r = await c.query(requete, parametres);
    await c.query("release savepoint tentative");
    await anonyme();
    return { ok: true, valeur: r.rows[0] };
  } catch (e) {
    await c.query("rollback to savepoint tentative");
    await anonyme();
    return { ok: false, message: e.message };
  }
};

/** Un établissement, son propriétaire, un visiteur et sa demande. */
const scene = async () => {
  const proprietaire = await creerCompte();
  const visiteur = await creerCompte();

  compteur++;
  const lieu = (
    await c.query(
      `insert into public.places (slug, name, type, city, address, description,
                                  lat, lng, status, owner_id)
       values ($1::text, 'Hotel de recette', 'lodging'::place_type, 'Abidjan',
               'Rue de recette, Cocody', 'Etablissement cree pour la recette.',
               5.35, -4.02, 'published'::place_status, $2)
       returning id`,
      [`hotel-de-recette-${compteur}`, proprietaire]
    )
  ).rows[0].id;

  const demande = (
    await c.query(
      `insert into public.leads (user_id, place_id, kind, full_name, email, phone,
                                 party_size, message, status)
       values ($1, $2, 'lodging'::lead_kind, 'Aya Koffi', 'aya@exemple.test',
               '+2250700000000', 2, 'Une chambre pour deux nuits', 'new'::lead_status)
       returning id`,
      [visiteur, lieu]
    )
  ).rows[0].id;

  return { proprietaire, visiteur, lieu, demande };
};

try {
  await etape("le propriétaire répond, et le visiteur est prévenu", async () => {
    const s = await scene();
    const r = await essayer(
      s.proprietaire,
      `select public.lead_traiter($1, 'contacted'::lead_status, 'Client sérieux', 'Bonjour, il nous reste une chambre vue lagune pour ces dates.') j`,
      [s.demande]
    );
    if (!r.ok) throw new Error(r.message);

    const d = (
      await c.query(
        `select status::text, partner_reply, replied_at, replied_by from public.leads where id = $1`,
        [s.demande]
      )
    ).rows[0];
    if (d.status !== "contacted") throw new Error(`statut ${d.status}`);
    if (!d.partner_reply?.includes("vue lagune")) throw new Error("la réponse n'est pas enregistrée");
    if (d.replied_by !== s.proprietaire) throw new Error("l'auteur de la réponse est faux");

    const avis = (
      await c.query(
        `select subject, body from public.notification_outbox
          where user_id = $1 and event = 'lead_reponse'`,
        [s.visiteur]
      )
    ).rows;
    if (avis.length === 0) throw new Error("le visiteur n'a pas été prévenu");
    if (!avis[0].body.includes("vue lagune")) throw new Error("l'avis ne porte pas la réponse");
    return "réponse enregistrée, visiteur prévenu";
  });

  await etape("la note interne ne part jamais au visiteur", async () => {
    // Elle sert à l'établissement, pas au client. La lui envoyer serait une
    // fuite, et personne ne s'en apercevrait avant qu'elle ne soit lue.
    const s = await scene();
    await essayer(
      s.proprietaire,
      `select public.lead_traiter($1, 'contacted'::lead_status, 'Attention : mauvais payeur en 2025', null) j`,
      [s.demande]
    );
    const avis = (
      await c.query(
        `select subject, body from public.notification_outbox where user_id = $1`,
        [s.visiteur]
      )
    ).rows;
    for (const a of avis) {
      if (`${a.subject} ${a.body}`.includes("mauvais payeur")) {
        throw new Error("la note interne est partie au visiteur");
      }
    }
    if (avis.length === 0) throw new Error("aucun avis de prise en charge");
    return "note gardée, prise en charge annoncée";
  });

  await etape("un autre hôtelier ne touche pas à la demande d'un confrère", async () => {
    const s = await scene();
    const autre = await scene();
    const r = await essayer(
      autre.proprietaire,
      `select public.lead_traiter($1, 'closed'::lead_status, null, 'Complet') j`,
      [s.demande]
    );
    if (r.ok) throw new Error("un confrère a traité la demande");
    if (!sansAccent(r.message).includes("ne concerne pas")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("le visiteur ne réécrit pas sa propre demande après coup", async () => {
    // Ce qu'il a écrit fait foi. Pouvoir le réécrire viderait la trace de son
    // sens, et le litige n'aurait plus de matière.
    const s = await scene();
    const r = await essayer(
      s.visiteur,
      `select public.lead_traiter($1, 'closed'::lead_status, null, 'annulez') j`,
      [s.demande]
    );
    if (r.ok) throw new Error("le visiteur a modifié sa demande");
    return "refuse";
  });

  await etape("LA GARDE : personne ne réécrit le message du visiteur", async () => {
    // Le defaut d'origine : la politique de modification n'avait pas de clause
    // WITH CHECK, et le role authenticated pouvait ecrire toutes les colonnes.
    const s = await scene();
    await commeSi(s.proprietaire);
    await c.query("set local role authenticated");
    let msg = "";
    try {
      await c.query(`update public.leads set message = 'autre chose' where id = $1`, [s.demande]);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query("reset role");
    await anonyme();
    if (!msg) throw new Error("LE MESSAGE DU VISITEUR A ETE REECRIT");
    if (!/permission|denied|droit/i.test(msg)) throw new Error(msg);
    return "écriture directe refusée";
  });

  await etape("LA GARDE : une demande ne se déplace pas chez un confrère", async () => {
    const s = await scene();
    const autre = await scene();
    await commeSi(s.proprietaire);
    await c.query("set local role authenticated");
    let msg = "";
    try {
      await c.query(`update public.leads set place_id = $1 where id = $2`, [autre.lieu, s.demande]);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query("reset role");
    await anonyme();
    if (!msg) throw new Error("LA DEMANDE A ETE DEPLACEE");
    return "déplacement refusé";
  });

  await etape("la note interne n'est pas lisible dans la table", async () => {
    const s = await scene();
    await commeSi(s.proprietaire);
    await c.query("set local role authenticated");
    let msg = "";
    try {
      await c.query(`select partner_note from public.leads where id = $1`, [s.demande]);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query("reset role");
    await anonyme();
    if (!msg) throw new Error("la note interne est lisible dans la table");
    return "colonne refusée";
  });

  await etape("le propriétaire relit sa note par la fonction prévue", async () => {
    const s = await scene();
    await essayer(s.proprietaire, `select public.lead_traiter($1, null, 'Rappeler lundi', null) j`, [
      s.demande,
    ]);
    const r = await essayer(s.proprietaire, `select public.lead_note_interne($1) n`, [s.demande]);
    if (!r.ok) throw new Error(r.message);
    if (r.valeur.n !== "Rappeler lundi") throw new Error(`note lue : ${r.valeur.n}`);
    return "note relue";
  });

  await etape("le visiteur ne relit pas la note interne, même par la fonction", async () => {
    const s = await scene();
    await essayer(s.proprietaire, `select public.lead_traiter($1, null, 'Client difficile', null) j`, [
      s.demande,
    ]);
    const r = await essayer(s.visiteur, `select public.lead_note_interne($1) n`, [s.demande]);
    if (r.ok) throw new Error("le visiteur a lu la note interne");
    return "refuse";
  });

  await etape("le visiteur lit la réponse qui lui est destinée", async () => {
    const s = await scene();
    await essayer(
      s.proprietaire,
      `select public.lead_traiter($1, 'contacted'::lead_status, null, 'Nous vous attendons vendredi.') j`,
      [s.demande]
    );
    await commeSi(s.visiteur);
    await c.query("set local role authenticated");
    const vue = (
      await c.query(`select partner_reply, status::text from public.leads where id = $1`, [s.demande])
    ).rows[0];
    await c.query("reset role");
    await anonyme();
    if (!vue?.partner_reply?.includes("vendredi")) throw new Error("le visiteur ne voit pas la réponse");
    if (vue.status !== "contacted") throw new Error(`statut ${vue.status}`);
    return "réponse visible";
  });

  await etape("un visiteur ne voit pas les demandes des autres", async () => {
    const s = await scene();
    const autre = await scene();
    await commeSi(s.visiteur);
    await c.query("set local role authenticated");
    const vues = (await c.query(`select id from public.leads`)).rows.map((r) => r.id);
    await c.query("reset role");
    await anonyme();
    if (!vues.includes(s.demande)) throw new Error("le visiteur ne voit pas sa propre demande");
    if (vues.includes(autre.demande)) throw new Error("il voit la demande d'un autre");
    return "une seule, la sienne";
  });

  await etape("chaque traitement laisse une trace nominative", async () => {
    const s = await scene();
    await essayer(
      s.proprietaire,
      `select public.lead_traiter($1, 'closed'::lead_status, null, 'Complet, désolé.') j`,
      [s.demande]
    );
    const t = (
      await c.query(
        `select details from public.audit_logs
          where action = 'lead_traiter' and entity_id = $1 and actor_id = $2`,
        [s.demande, s.proprietaire]
      )
    ).rows[0];
    if (!t) throw new Error("aucune trace");
    if (t.details.statut_avant !== "new" || t.details.statut_apres !== "closed") {
      throw new Error(`trace : ${JSON.stringify(t.details)}`);
    }
    return "avant et après conservés";
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
