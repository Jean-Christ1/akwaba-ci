/**
 * Recette de la file d'envoi et des avis internes.
 *
 * Deux promesses ne tenaient pas.
 *
 * La première : le canal « dans l'application » est proposé dans les
 * préférences, et c'est aussi le dernier maillon du routage, celui qui ne peut
 * pas échouer. Il n'atterrissait nulle part. Le message partait dans la file,
 * la file n'est lisible que du personnel, et aucun écran ne la montrait.
 *
 * La seconde : le courriel n'a aucun porteur. Un message y reste « en attente »
 * pour toujours, pendant que la console dit « déposé » et que l'expéditeur
 * attend une réponse.
 *
 * Cette recette éprouve la lecture des avis, son cloisonnement, et le fait que
 * le système dise désormais ce qu'il ne sait pas faire.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-file-et-avis.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette de la file"));
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
      [`file-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const avecLeDroitDe = async (code) => {
  const uid = await creerCompte();
  await c.query(
    `insert into public.user_permissions (user_id, permission_code, accorde, motif)
     values ($1, $2, true, 'Recette de la file')`,
    [uid, code]
  );
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

/** Quelqu'un qui ne peut être joint que dans l'application. */
const injoignableDehors = async () => {
  const uid = await creerCompte();
  await c.query(
    `update public.profiles set canal_prefere = 'in_app', whatsapp = null, phone = null
      where id = $1`,
    [uid]
  );
  // La colonne d'adresse d'authentification est vidée : sans elle, le routage
  // ne peut plus retomber sur le courriel, et l'avis interne est le seul choix.
  await c.query(`update auth.users set email = null where id = $1`, [uid]);
  return uid;
};

const deposer = async (uid, sujet = "Avis de recette") => {
  await c.query(`select public.notify_enqueue($1, null, 'recette_avis', $2, 'Corps de recette')`, [
    uid,
    sujet,
  ]);
};

try {
  await etape("le routage choisit l'avis interne quand rien d'autre ne joint", async () => {
    const uid = await injoignableDehors();
    const r = (await c.query(`select canal, destination from public.notification_route($1)`, [uid]))
      .rows[0];
    if (r.canal !== "in_app") throw new Error(`le routage a choisi « ${r.canal} »`);
    if (r.destination !== uid) throw new Error("la destination n'est pas le compte lui-même");
    return "in_app, destination = le compte";
  });

  await etape("LE TROU : l'avis déposé était invisible de son destinataire", async () => {
    const uid = await injoignableDehors();
    await deposer(uid);
    const r = await appeler(uid, `select * from public.mes_avis(10)`);
    if (!r.ok) throw new Error(r.message);
    if (r.nombre !== 1) throw new Error(`${r.nombre} avis rendus au lieu d'un`);
    if (r.lignes[0].sujet !== "Avis de recette") throw new Error("le sujet ne suit pas");
    if (!r.lignes[0].corps) throw new Error("le corps est vide");
    return "l'avis se lit";
  });

  await etape("il ne voit que les siens", async () => {
    const moi = await injoignableDehors();
    const autre = await injoignableDehors();
    await deposer(moi, "Le mien");
    await deposer(autre, "Celui d'un autre");

    const r = await appeler(moi, `select sujet from public.mes_avis(10)`);
    const sujets = r.lignes.map((l) => l.sujet);
    if (!sujets.includes("Le mien")) throw new Error("son propre avis manque");
    if (sujets.includes("Celui d'un autre")) throw new Error("IL LIT L'AVIS D'UN AUTRE");
    return "un avis vu, un avis caché";
  });

  await etape("la lecture directe de la file reste fermée, sauf ses avis internes", async () => {
    // Un avis interne porte peu de chose ; la file entiere porte des adresses
    // et des numeros, et se lit avec le droit d'exploitation.
    const uid = await injoignableDehors();
    await deposer(uid);
    const cible = await creerCompte();
    await c.query(
      `insert into public.notification_outbox (user_id, event, subject, body, channel, destination)
       values ($1, 'recette_courriel', 'Sujet', 'Corps', 'email', 'quelquun@exemple.test')`,
      [cible]
    );

    const r = await appeler(uid, `select channel from public.notification_outbox`);
    if (!r.ok) throw new Error(r.message);
    const canaux = [...new Set(r.lignes.map((l) => l.channel))];
    if (canaux.some((x) => x !== "in_app"))
      throw new Error("un avis d'un autre canal est lisible : " + canaux.join(", "));
    return `${r.nombre} ligne(s), toutes internes`;
  });

  await etape("le compteur des non-lus suit les lectures", async () => {
    const uid = await injoignableDehors();
    await deposer(uid, "Premier");
    await deposer(uid, "Second");

    const compter = async () =>
      (await appeler(uid, `select public.mes_avis_non_lus() n`)).lignes[0].n;

    if ((await compter()) !== 2) throw new Error("le compteur ne voit pas les deux avis");

    const premier = (await appeler(uid, `select id from public.mes_avis(10)`)).lignes[0].id;
    const marques = (await appeler(uid, `select public.avis_marquer_lu($1) n`, [premier])).lignes[0]
      .n;
    if (marques !== 1) throw new Error(`${marques} avis marqués au lieu d'un`);
    if ((await compter()) !== 1) throw new Error("le compteur n'a pas baissé");

    await appeler(uid, `select public.avis_marquer_lu(null)`);
    if ((await compter()) !== 0) throw new Error("« tout marquer » n'a pas tout marqué");
    return "2 puis 1 puis 0";
  });

  await etape("on ne marque pas lu l'avis d'un autre", async () => {
    const moi = await injoignableDehors();
    const autre = await injoignableDehors();
    await deposer(autre, "Le sien");
    const sien = (
      await c.query(
        `select id from public.notification_outbox where user_id = $1 order by created_at desc limit 1`,
        [autre]
      )
    ).rows[0].id;

    const r = await appeler(moi, `select public.avis_marquer_lu($1) n`, [sien]);
    if (r.ok && r.lignes[0].n > 0) throw new Error("IL A MARQUE LU L'AVIS D'UN AUTRE");
    const encore = (
      await c.query(`select lue_le from public.notification_outbox where id = $1`, [sien])
    ).rows[0].lue_le;
    if (encore) throw new Error("l'avis d'un autre a été marqué lu");
    return "aucun avis touché";
  });

  await etape("SANTE : la file dit quel canal n'a pas de porteur", async () => {
    const exploitant = await avecLeDroitDe("exploitation.sante");
    const r = await appeler(exploitant, `select * from public.file_sante()`);
    if (!r.ok) throw new Error(r.message);
    if (r.nombre !== 4) throw new Error(`${r.nombre} canaux rendus au lieu de quatre`);

    const parCanal = Object.fromEntries(r.lignes.map((l) => [l.canal, l]));
    if (!parCanal.whatsapp.porteur_actif)
      throw new Error("le porteur WhatsApp est signalé inactif alors qu'il tourne");
    if (parCanal.email.porteur_actif)
      throw new Error("un porteur de courriel est annoncé alors qu'il n'y en a pas");
    if (!parCanal.email.verdict.toLowerCase().includes("aucun porteur"))
      throw new Error("le verdict du courriel ne nomme pas le manque : " + parCanal.email.verdict);
    if (!parCanal.in_app.porteur_actif)
      throw new Error("l'avis interne est encore annoncé sans lecture possible");
    return "whatsapp et in_app portés, courriel et sms nommés sans porteur";
  });

  await etape("elle est réservée à qui a le droit de la lire", async () => {
    const r = await appeler(await creerCompte(), `select * from public.file_sante()`);
    if (r.ok) throw new Error("un compte ordinaire lit la santé de la file");
    if (!r.message.toLowerCase().includes("droit")) throw new Error(r.message);
    return "refusé";
  });

  await etape("l'expéditeur apprend que son message n'a pas de porteur", async () => {
    // C'est le point qui evite la fausse reussite : la console disait
    // « depose », l'expediteur comprenait « parti ».
    const support = await avecLeDroitDe("notifications.envoyer");
    const cible = await creerCompte();
    const r = await appeler(
      support,
      `select public.message_envoyer($1, 'Suite a votre appel', 'Un corps de message assez long.') as x`,
      [cible]
    );
    if (!r.ok) throw new Error(r.message);
    const x = r.lignes[0].x;
    if (x.canal !== "email") throw new Error(`canal « ${x.canal} » inattendu`);
    if (x.porteur_actif !== false)
      throw new Error("le message se dit porté alors qu'aucun porteur n'existe");
    return "canal courriel, porteur absent, et c'est dit";
  });

  await etape("un message vers quelqu'un joignable dans l'application est porté", async () => {
    const support = await avecLeDroitDe("notifications.envoyer");
    const cible = await injoignableDehors();
    const r = await appeler(
      support,
      `select public.message_envoyer($1, 'Bonjour', 'Un corps de message assez long.') as x`,
      [cible]
    );
    if (!r.ok) throw new Error(r.message);
    if (r.lignes[0].x.canal !== "in_app") throw new Error(`canal « ${r.lignes[0].x.canal} »`);
    if (r.lignes[0].x.porteur_actif !== true)
      throw new Error("l'avis interne se dit sans porteur alors que la lecture existe");

    const lu = await appeler(cible, `select sujet from public.mes_avis(10)`);
    if (!lu.lignes.some((l) => l.sujet === "Bonjour"))
      throw new Error("le destinataire ne voit pas le message du support");
    return "déposé, porté, et lu par son destinataire";
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
