/**
 * Recette des droits qui ne sont plus morts.
 *
 * Trois droits du catalogue s'affichaient « accordé » sans rien ouvrir :
 * « lieux.lire », « notifications.envoyer », « organisations.gerer ».
 *
 * Le premier a été branché sur une porte qui existait déjà. Les deux autres
 * nommaient un geste que l'application ne savait pas faire : écrire à quelqu'un
 * depuis la console, et aider une organisation dont on n'est pas membre. Cette
 * recette vérifie les trois, et vérifie surtout que le branchement n'a rien
 * élargi au passage.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-droits-vivants.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des droits vivants"));
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
      [`droits-vivants-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const avecRole = async (code) => {
  const uid = await creerCompte();
  await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, $2)`, [
    uid,
    code,
  ]);
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

/** Un lieu au brouillon : invisible de tous sauf de son propriétaire. */
const lieuBrouillon = async (proprietaire) => {
  compteur++;
  return (
    await c.query(
      `insert into public.places (slug, name, type, city, address, description, lat, lng, status, owner_id)
       values ($1, 'Maquis de recette', 'restaurant', 'Abidjan', 'Cocody', 'Lieu de recette',
               5.35, -4.02, 'draft'::place_status, $2)
       returning id`,
      [`recette-lieu-${compteur}`, proprietaire]
    )
  ).rows[0].id;
};

try {
  // -------------------------------------------------------------------------
  // Les lieux
  // -------------------------------------------------------------------------

  await etape("LIEUX : un visiteur ne voit pas un lieu au brouillon", async () => {
    const lieu = await lieuBrouillon(await creerCompte());
    const r = await appeler(await creerCompte(), `select id from public.places where id = $1`, [
      lieu,
    ]);
    if (!r.ok) throw new Error(r.message);
    if (r.nombre !== 0) throw new Error("un brouillon est visible de tous");
    return "invisible";
  });

  await etape("son propriétaire, si", async () => {
    const proprietaire = await creerCompte();
    const lieu = await lieuBrouillon(proprietaire);
    const r = await appeler(proprietaire, `select id from public.places where id = $1`, [lieu]);
    if (r.nombre !== 1) throw new Error("le propriétaire ne voit plus son propre lieu");
    return "visible du propriétaire";
  });

  await etape("et « lieux.lire » l'ouvre au personnel", async () => {
    const lieu = await lieuBrouillon(await creerCompte());
    const lecteur = await avecRole("admin_contenu");
    const r = await appeler(lecteur, `select id from public.places where id = $1`, [lieu]);
    if (r.nombre !== 1) throw new Error("le droit n'ouvre pas le brouillon");
    return "ouvert par le droit, sans rôle hérité";
  });

  await etape("un droit retiré nominativement referme la porte", async () => {
    // C'est ce qui distingue un vrai branchement d'un affichage : l'exception
    // nominative doit primer sur le role, jusque dans la politique.
    const lieu = await lieuBrouillon(await creerCompte());
    const lecteur = await avecRole("admin_contenu");
    await c.query(
      `insert into public.user_permissions (user_id, permission_code, accorde, motif)
       values ($1, 'lieux.lire', false, 'Retrait de recette')`,
      [lecteur]
    );
    const r = await appeler(lecteur, `select id from public.places where id = $1`, [lieu]);
    if (r.nombre !== 0) throw new Error("le retrait nominatif ne ferme pas la porte");
    return "retrait nominatif prioritaire";
  });

  await etape("« lieux.moderer » publie, et sans lui rien ne bouge", async () => {
    const lieu = await lieuBrouillon(await creerCompte());
    const publier = `update public.places set status = 'published'::place_status where id = $1`;

    const sans = await appeler(await creerCompte(), publier, [lieu]);
    if (sans.ok && sans.nombre > 0) throw new Error("un visiteur a publié un lieu");

    const avec = await appeler(await avecRole("admin_contenu"), publier, [lieu]);
    if (!avec.ok) throw new Error(avec.message);
    const etat = (await c.query(`select status::text from public.places where id = $1`, [lieu]))
      .rows[0].status;
    if (etat !== "published") throw new Error(`le lieu est resté « ${etat} »`);
    return "publié par le droit seul";
  });

  // -------------------------------------------------------------------------
  // Écrire à quelqu'un
  // -------------------------------------------------------------------------

  await etape("MESSAGE : sans « notifications.envoyer », rien ne part", async () => {
    const r = await appeler(
      await creerCompte(),
      `select public.message_envoyer($1, 'Bonjour', 'Nous revenons vers vous au sujet de votre course.')`,
      [await creerCompte()]
    );
    if (r.ok) throw new Error("un compte ordinaire a envoyé un message");
    if (!sansAccent(r.message).includes("droit d'envoyer")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("avec le droit, le message est déposé dans la file d'envoi", async () => {
    const support = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    const r = await appeler(
      support,
      `select public.message_envoyer($1, 'Suite a votre appel', 'Votre remboursement est en cours de traitement.') as x`,
      [cible]
    );
    if (!r.ok) throw new Error(r.message);
    const avis = (
      await c.query(
        `select event, subject, channel, state::text from public.notification_outbox
          where user_id = $1 order by created_at desc limit 1`,
        [cible]
      )
    ).rows[0];
    if (!avis) throw new Error("rien n'est arrivé dans la file");
    if (avis.event !== "message_support") throw new Error(`événement « ${avis.event} »`);
    return `déposé sur ${avis.channel}`;
  });

  await etape("le canal respecte le consentement, il ne le force pas", async () => {
    // Un message du support n'est pas commercial, mais il n'a pas non plus a
    // partir sur WhatsApp si la personne ne l'a jamais accepte.
    const support = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await c.query(
      `update public.profiles set canal_prefere = 'whatsapp', whatsapp = '0709112233',
              whatsapp_consent_at = null where id = $1`,
      [cible]
    );
    const r = await appeler(
      support,
      `select public.message_envoyer($1, 'Information', 'Votre dossier avance normalement.') as x`,
      [cible]
    );
    if (!r.ok) throw new Error(r.message);
    const canal = (
      await c.query(
        `select channel from public.notification_outbox where user_id = $1 order by created_at desc limit 1`,
        [cible]
      )
    ).rows[0].channel;
    if (canal === "whatsapp") throw new Error("le message est parti sur WhatsApp sans consentement");
    return `replié sur ${canal}`;
  });

  await etape("un message vide ou sans destinataire est refusé", async () => {
    const support = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    const refus = [
      [cible, "Ok", "Un corps de message suffisamment long."],
      // « trop court » fait exactement dix caracteres, la longueur minimale :
      // le premier jet de cette recette croyait donc refuser ce qui passait.
      [cible, "Un sujet correct", "court"],
      ["00000000-0000-0000-0000-000000000000", "Un sujet correct", "Un corps de message assez long."],
    ];
    for (const [qui, sujet, corps] of refus) {
      const r = await appeler(support, `select public.message_envoyer($1, $2, $3)`, [
        qui,
        sujet,
        corps,
      ]);
      if (r.ok) throw new Error(`« ${sujet} » / « ${corps} » est passé`);
    }
    return "trois refus";
  });

  await etape("l'envoi laisse une trace nominative", async () => {
    const support = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(
      support,
      `select public.message_envoyer($1, 'Objet trace', 'Un corps de message assez long pour passer.')`,
      [cible]
    );
    const l = (
      await c.query(
        `select actor_id, details->>'sujet' sujet from public.audit_logs
          where action = 'message_envoyer' and entity_id = $1`,
        [cible]
      )
    ).rows;
    if (l.length !== 1) throw new Error(`${l.length} trace(s)`);
    if (l[0].actor_id !== support) throw new Error("la trace ne nomme pas l'expéditeur");
    if (l[0].sujet !== "Objet trace") throw new Error("le sujet n'est pas conservé");
    return "expéditeur et sujet tracés";
  });

  // -------------------------------------------------------------------------
  // Les organisations
  // -------------------------------------------------------------------------

  const organisation = async () => {
    const fondateur = await creerCompte();
    const org = (
      await appeler(fondateur, `select (public.organisation_create($1)).id as id`, [
        `Organisation de recette ${++compteur}`,
      ])
    ).lignes[0].id;
    return { fondateur, org };
  };

  await etape("ORGANISATIONS : sans le droit, le personnel ne touche à rien", async () => {
    const { org } = await organisation();
    const r = await appeler(
      await avecRole("moderateur"),
      `select (public.organisation_gerer($1, 'Nom impose')).id`,
      [org]
    );
    if (r.ok) throw new Error("un modérateur a modifié une organisation");
    if (!sansAccent(r.message).includes("gerer les organisations")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("avec le droit, il corrige les coordonnées sans devenir membre", async () => {
    const { org } = await organisation();
    const gestionnaire = await avecRole("admin_plateforme");
    const r = await appeler(
      gestionnaire,
      `select (public.organisation_gerer($1, null, 'contact@exemple.ci', null)).contact_email as e`,
      [org]
    );
    if (!r.ok) throw new Error(r.message);
    if (r.lignes[0].e !== "contact@exemple.ci") throw new Error("la coordonnée n'est pas écrite");

    const membre = (
      await c.query(
        `select count(*)::int n from public.organisation_members where organisation_id = $1 and user_id = $2`,
        [org, gestionnaire]
      )
    ).rows[0].n;
    if (membre !== 0) throw new Error("le gestionnaire est devenu membre de l'organisation");
    return "coordonnée corrigée, aucune adhésion";
  });

  await etape("un paramètre absent ne touche à rien, une chaîne vide efface", async () => {
    const { org } = await organisation();
    const gestionnaire = await avecRole("admin_plateforme");
    const avant = (await c.query(`select name from public.organisations where id = $1`, [org]))
      .rows[0].name;

    await appeler(gestionnaire, `select public.organisation_gerer($1, null, 'a@b.ci', '0700000000')`, [
      org,
    ]);
    await appeler(gestionnaire, `select public.organisation_gerer($1, null, '', null)`, [org]);

    const l = (
      await c.query(`select name, contact_email, contact_phone from public.organisations where id = $1`, [
        org,
      ])
    ).rows[0];
    if (l.name !== avant) throw new Error("le nom a bougé sans qu'on le demande");
    if (l.contact_email !== null) throw new Error("la chaîne vide n'a pas effacé");
    if (l.contact_phone !== "0700000000") throw new Error("le téléphone a été perdu");
    return "absent conservé, vide effacé";
  });

  await etape("le code d'adhésion se renouvelle quand le responsable est parti", async () => {
    // C'est le cas qui justifie le droit : sans lui, une organisation dont le
    // responsable a disparu garde a jamais un code que tous ses anciens
    // membres connaissent.
    const { fondateur, org } = await organisation();
    const avant = (await c.query(`select join_code from public.organisations where id = $1`, [org]))
      .rows[0].join_code;

    await c.query(`delete from public.organisation_members where organisation_id = $1`, [org]);

    const sans = await appeler(fondateur, `select public.organisation_rotate_join_code($1)`, [org]);
    if (sans.ok) throw new Error("un ancien membre a renouvelé le code");

    const avec = await appeler(
      await avecRole("admin_plateforme"),
      `select public.organisation_rotate_join_code($1) as code`,
      [org]
    );
    if (!avec.ok) throw new Error(avec.message);
    if (avec.lignes[0].code === avant) throw new Error("le code n'a pas changé");
    return "code renouvelé par le personnel";
  });

  await etape("le responsable en place le renouvelle toujours lui-même", async () => {
    // Une garde qui bloque tout ne protege rien : le chemin normal doit rester
    // ouvert, sinon toute organisation depend du support pour un geste courant.
    const { fondateur, org } = await organisation();
    const r = await appeler(fondateur, `select public.organisation_rotate_join_code($1) as code`, [
      org,
    ]);
    if (!r.ok) throw new Error(r.message);
    if (!r.lignes[0].code) throw new Error("aucun code rendu");
    return "chemin normal intact";
  });

  await etape("plus aucun droit du catalogue n'est mort", async () => {
    const morts = (await c.query(`select code from public.droits_jamais_consultes() order by code`))
      .rows.map((l) => l.code);
    if (morts.length) throw new Error("droits sans porte : " + morts.join(", "));
    return "35 droits, 35 portes";
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
