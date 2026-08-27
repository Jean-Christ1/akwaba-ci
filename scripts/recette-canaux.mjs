/**
 * Recette du routage des notifications.
 *
 * Un routage se juge sur ses replis. Ce controle cree de vraies personnes avec
 * de vrais profils, et verifie contre la base reelle que chaque message part
 * vers le bon canal, et que la raison du repli est inscrite quand il y en a un.
 *
 * Tout se passe dans une transaction annulee : rien ne subsiste.
 *
 * Usage : node scripts/recette-canaux.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des canaux"));
await c.connect();
await c.query("begin");

let n = 0;
const echecs = [];

/** Chaque compte doit avoir une adresse unique, sans horloge ni hasard. */
let compteur = 0;
const suffixe = () => `${++compteur}`;

const etape = async (titre, fn) => {
  n++;
  try {
    // Un point de reprise par etape : une etape qui echoue ne doit pas
    // emporter les suivantes en avortant la transaction.
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

const creerCompte = async (etiquette, avecEmail = true) =>
  (
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), now(), now()) returning id`,
      [avecEmail ? `${etiquette}-${suffixe()}@exemple.test` : null]
    )
  ).rows[0].id;

const profil = async (uid, champs) => {
  await c.query(
    `insert into public.profiles (id, display_name, phone, whatsapp, canal_prefere,
       whatsapp_consent_at, sms_consent_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set
       phone = excluded.phone, whatsapp = excluded.whatsapp,
       canal_prefere = excluded.canal_prefere,
       whatsapp_consent_at = excluded.whatsapp_consent_at,
       sms_consent_at = excluded.sms_consent_at`,
    [
      uid,
      champs.nom ?? "Recette",
      champs.phone ?? null,
      champs.whatsapp ?? null,
      champs.prefere ?? "whatsapp",
      champs.whatsappOk ? new Date().toISOString() : null,
      champs.smsOk ? new Date().toISOString() : null,
    ]
  );
};

const route = async (uid) =>
  (await c.query(`select * from public.notification_route($1)`, [uid])).rows[0];

try {
  await etape("WhatsApp consenti avec un numero valide : le message y part", async () => {
    const uid = await creerCompte("wa");
    await profil(uid, { whatsapp: "+225 07 00 00 00 01", whatsappOk: true, prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal !== "whatsapp") throw new Error(`canal ${r.canal}`);
    if (!r.destination.includes("07 00 00 00 01")) throw new Error(`destination ${r.destination}`);
    if (r.motif) throw new Error(`repli inattendu : ${r.motif}`);
    return `-> ${r.canal}`;
  });

  await etape("sans consentement WhatsApp, on descend et on dit pourquoi", async () => {
    const uid = await creerCompte("wa-sans-consentement");
    await profil(uid, { whatsapp: "+225 07 00 00 00 02", whatsappOk: false, prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal === "whatsapp") throw new Error("parti en whatsapp sans consentement");
    if (!r.motif || !r.motif.includes("consentement")) {
      throw new Error(`le motif ne cite pas le consentement : ${r.motif}`);
    }
    return `-> ${r.canal} (${r.motif})`;
  });

  await etape("un numero trop court est traite comme absent", async () => {
    const uid = await creerCompte("wa-court");
    await profil(uid, { whatsapp: "0700", whatsappOk: true, prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal === "whatsapp") throw new Error("parti vers un numero de quatre chiffres");
    if (!r.motif || !r.motif.includes("numero")) throw new Error(`motif : ${r.motif}`);
    return `-> ${r.canal} (${r.motif})`;
  });

  await etape("le SMS prend le relais quand il est consenti", async () => {
    const uid = await creerCompte("sms");
    await profil(uid, { phone: "+225 05 00 00 00 03", smsOk: true, prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal !== "sms") throw new Error(`canal ${r.canal}`);
    return `-> ${r.canal} (${r.motif})`;
  });

  await etape("le courriel transactionnel ne demande pas de consentement", async () => {
    const uid = await creerCompte("mail");
    await profil(uid, { prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal !== "email") throw new Error(`canal ${r.canal}`);
    if (!r.destination.includes("@")) throw new Error(`destination ${r.destination}`);
    return `-> ${r.canal}`;
  });

  await etape("sans adresse ni numero, le message reste dans l'application", async () => {
    const uid = await creerCompte("rien", false);
    await profil(uid, { prefere: "whatsapp" });
    const r = await route(uid);
    if (r.canal !== "in_app") throw new Error(`canal ${r.canal}`);
    if (!r.motif || !r.motif.includes("adresse")) throw new Error(`motif : ${r.motif}`);
    return `-> ${r.canal} (${r.motif})`;
  });

  await etape("la preference est respectee quand elle est joignable", async () => {
    const uid = await creerCompte("pref-mail");
    await profil(uid, {
      whatsapp: "+225 07 00 00 00 04",
      whatsappOk: true,
      prefere: "email",
    });
    const r = await route(uid);
    if (r.canal !== "email") throw new Error(`canal ${r.canal} alors que la preference est email`);
    return `-> ${r.canal}`;
  });

  await etape("le depot inscrit le canal et la destination", async () => {
    const uid = await creerCompte("depot");
    await profil(uid, { whatsapp: "+225 07 00 00 00 05", whatsappOk: true, prefere: "whatsapp" });
    await c.query(
      `select public.notify_enqueue($1, null, 'recette_canal', 'Sujet de recette', 'Corps')`,
      [uid]
    );
    const o = (
      await c.query(
        `select channel, destination, repli_motif from public.notification_outbox
          where user_id = $1 order by created_at desc limit 1`,
        [uid]
      )
    ).rows[0];
    if (!o) throw new Error("rien n'a ete depose");
    if (o.channel !== "whatsapp") throw new Error(`canal depose ${o.channel}`);
    if (!o.destination) throw new Error("aucune destination inscrite");
    return `${o.channel} -> ${o.destination}`;
  });

  await etape("le portage reclame le canal et la destination du depot", async () => {
    // Le porteur declare ce qu'il sait porter. Sans declaration, la file ne
    // remet que du courriel : c'est ce qui protege les messages WhatsApp du
    // porteur en place, qui ne sait pas les envoyer.
    const lot = (
      await c.query(`select * from public.notify_claim_batch(50, array['email','whatsapp'])`)
    ).rows;
    const ligne = lot.find((x) => x.event === "recette_canal");
    if (!ligne) throw new Error("la notification deposee n'est pas reclamee");
    if (ligne.canal !== "whatsapp") throw new Error(`le portage recoit ${ligne.canal}`);
    if (!ligne.destination) throw new Error("le portage ne recoit pas de destination");
    return `${ligne.canal} -> ${ligne.destination}`;
  });

  await etape("un compte sans adresse est quand meme reclame par le portage", async () => {
    // La version precedente ecartait toute notification dont le compte n'avait
    // pas d'adresse. Un message WhatsApp n'en a pas besoin, et se trouvait
    // silencieusement perdu.
    const uid = await creerCompte("sans-adresse", false);
    await profil(uid, { whatsapp: "+225 07 00 00 00 06", whatsappOk: true });
    await c.query(
      `select public.notify_enqueue($1, null, 'recette_sans_adresse', 'Sujet', 'Corps')`,
      [uid]
    );
    const lot = (
      await c.query(`select * from public.notify_claim_batch(50, array['email','whatsapp'])`)
    ).rows;
    const ligne = lot.find((x) => x.event === "recette_sans_adresse");
    if (!ligne) throw new Error("perdue faute d'adresse, comme avant");
    return `${ligne.canal} -> ${ligne.destination}`;
  });

  await etape("un canal sans fournisseur rend sa tentative au lieu de se consumer", async () => {
    // Reclamer incremente le compteur, et cinq tentatives condamnent le
    // message. Un canal qui n'a pas encore de fournisseur n'est pas un echec :
    // laisser bruler ses essais perdrait tout ce qui a ete depose avant la
    // signature du contrat.
    const uid = await creerCompte("report");
    await profil(uid, { whatsapp: "+225 07 11 22 33 44", whatsappOk: true, prefere: "whatsapp" });
    await c.query(
      `select public.notify_enqueue($1, null, 'recette_report', 'Sujet', 'Corps')`,
      [uid]
    );
    const id = (
      await c.query(
        `select id from public.notification_outbox where user_id = $1 and event = 'recette_report'`,
        [uid]
      )
    ).rows[0].id;

    await c.query(`select * from public.notify_claim_batch(50, array['email','whatsapp'])`);
    const apresReclamation = (
      await c.query(`select attempts from public.notification_outbox where id = $1`, [id])
    ).rows[0].attempts;
    if (apresReclamation !== 1) throw new Error(`tentatives ${apresReclamation} au lieu de 1`);

    await c.query(`select public.notify_mark($1, 'pending', 'canal sans fournisseur')`, [id]);
    const apres = (
      await c.query(
        `select attempts, state::text, last_error from public.notification_outbox where id = $1`,
        [id]
      )
    ).rows[0];
    if (apres.attempts !== 0) throw new Error(`tentative non rendue : ${apres.attempts}`);
    if (apres.state !== "pending") throw new Error(`etat ${apres.state}`);
    if (!apres.last_error.includes("fournisseur")) throw new Error("la raison n'est pas inscrite");
    return "tentative rendue, message conserve";
  });

  await etape("un porteur qui ne declare rien ne recoit que du courriel", async () => {
    // Les fonctions serveur ne peuvent pas etre redeployees depuis ce poste.
    // Le porteur en place ne sait envoyer que des courriels : lui remettre un
    // message WhatsApp lui ferait bruler cinq tentatives et le condamnerait.
    await c.query(`update public.notification_outbox set state = 'pending', attempts = 0`);
    const enAttente = (
      await c.query(
        `select count(*)::int n from public.notification_outbox
          where state = 'pending' and channel = 'whatsapp'`
      )
    ).rows[0].n;
    if (enAttente === 0) throw new Error("aucun whatsapp en attente : rien a eprouver");

    const lot = (await c.query(`select * from public.notify_claim_batch(50)`)).rows;
    const canaux = [...new Set(lot.map((x) => x.canal))];
    if (canaux.some((x) => x !== "email")) {
      throw new Error(`le porteur par defaut recoit ${canaux.join(", ")}`);
    }
    return `${enAttente} whatsapp preserve(s)`;
  });

  await etape("la vue de sante compte par canal", async () => {
    const v = (await c.query(`select canal, etat, nombre from public.notification_health`)).rows;
    if (v.length === 0) throw new Error("la vue ne rend rien");
    if (!v.some((x) => x.canal === "whatsapp")) throw new Error("aucun canal whatsapp visible");
    return v.map((x) => `${x.canal}/${x.etat}=${x.nombre}`).join(" ");
  });
} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} etapes vertes`);
console.log("(transaction annulee : la base est intacte)");
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
