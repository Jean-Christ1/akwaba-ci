/**
 * Recette du porteur WhatsApp.
 *
 * Le routage sait choisir WhatsApp depuis longtemps ; ce qui manquait etait
 * quelqu'un pour porter les messages. Le porteur vit maintenant dans la base,
 * avec pg_net pour l'appel et le coffre chiffre pour les identifiants.
 *
 * Cette recette verifie ce qui peut l'etre sans expedier a un inconnu : la
 * configuration, la mise en forme des numeros, le refus de ce qui n'est pas un
 * numero, et le fait qu'un message reclame soit bien remis au transporteur.
 *
 * Elle n'envoie pas de vrai message par defaut. Avec --envoyer <numero>, elle
 * en expedie un seul, au numero donne, qui doit avoir rejoint le bac a sable.
 *
 * Usage :
 *   node scripts/recette-whatsapp.mjs
 *   node scripts/recette-whatsapp.mjs --envoyer +2250700000000
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const idx = process.argv.indexOf("--envoyer");
const numeroReel = idx > -1 ? process.argv[idx + 1] : null;

const c = new pg.Client(exigerConfiguration("recette WhatsApp"));
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
      [`whatsapp-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

try {
  await etape("les identifiants sont au coffre de la base", async () => {
    const r = (
      await c.query(`select public.secret_lire('twilio_api_key_sid') is not null ok,
                            public.secret_lire('twilio_whatsapp_from') expediteur`)
    ).rows[0];
    if (!r.ok) throw new Error("la cle d'API n'est pas au coffre");
    if (!r.expediteur?.startsWith("whatsapp:")) throw new Error(`expediteur ${r.expediteur}`);
    return r.expediteur;
  });

  await etape("le secret n'est pas lisible par un compte ordinaire", async () => {
    // Le coffre chiffre au repos, mais c'est le REVOKE qui empeche un
    // utilisateur connecte d'appeler la fonction de lecture.
    const uid = await creerCompte();
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    let msg = "";
    try {
      await c.query(`select public.secret_lire('twilio_api_key_secret')`);
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint etape");
    }
    await c.query("reset role").catch(() => {});
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (!msg) throw new Error("un compte ordinaire a lu le secret");
    if (!sansAccent(msg).includes("permission")) throw new Error(`refus inattendu : ${msg}`);
    return "refuse";
  });

  await etape("un numero ivoirien est mis au format attendu par Twilio", async () => {
    // On n'envoie pas : on verifie que la fonction accepte le numero et rend un
    // identifiant de requete. Le format est valide avant l'appel sortant.
    const r = await c.query(`select public.whatsapp_envoyer('+225 07 11 22 33 44', 'Recette') r`);
    if (!r.rows[0].r) throw new Error("aucun identifiant de requete rendu");
    return `requete #${r.rows[0].r}`;
  });

  await etape("un numero sans separateur passe aussi", async () => {
    const r = await c.query(`select public.whatsapp_envoyer('2250711223344', 'Recette') r`);
    if (!r.rows[0].r) throw new Error("refuse alors que le numero est valide");
    return "accepte";
  });

  await etape("ce qui n'est pas un numero est refuse", async () => {
    for (const mauvais of ["", "abc", "0712", "+22507112233445566778899"]) {
      await c.query("savepoint mauvais");
      let msg = "";
      try {
        await c.query(`select public.whatsapp_envoyer($1, 'Recette')`, [mauvais]);
      } catch (e) {
        msg = e.message;
      }
      await c.query("rollback to savepoint mauvais");
      if (!msg) throw new Error(`« ${mauvais} » a ete accepte comme numero`);
    }
    return "quatre formes refusees";
  });

  await etape("le porteur reclame la file WhatsApp et la remet au transporteur", async () => {
    const uid = await creerCompte();
    await c.query(
      `insert into public.profiles (id, whatsapp, canal_prefere, whatsapp_consent_at)
       values ($1, '+225 07 55 66 77 88', 'whatsapp', now())
       on conflict (id) do update set whatsapp = excluded.whatsapp,
         canal_prefere = excluded.canal_prefere, whatsapp_consent_at = excluded.whatsapp_consent_at`,
      [uid]
    );
    await c.query(`select public.notify_enqueue($1, null, 'recette_wa', 'Sujet', 'Corps')`, [uid]);

    const avant = (
      await c.query(
        `select count(*)::int n from public.notification_outbox
          where channel = 'whatsapp' and state = 'pending'`
      )
    ).rows[0].n;
    if (avant === 0) throw new Error("rien en attente : le routage n'a pas choisi WhatsApp");

    const r = (await c.query(`select public.whatsapp_porter_la_file(10) r`)).rows[0].r;
    if (Number(r.envoyes) === 0 && Number(r.echoues) === 0) {
      throw new Error(`le porteur n'a rien pris : ${JSON.stringify(r)}`);
    }
    return `${r.envoyes} remis, ${r.echoues} en echec`;
  });

  await etape("un message remis porte la trace de sa requete", async () => {
    const ligne = (
      await c.query(
        `select state::text, last_error from public.notification_outbox
          where channel = 'whatsapp' and event = 'recette_wa'
          order by created_at desc limit 1`
      )
    ).rows[0];
    if (!ligne) throw new Error("le message a disparu");
    if (ligne.state === "sent" && !String(ligne.last_error).includes("pg_net")) {
      throw new Error("aucune trace de la requete sortante");
    }
    return `${ligne.state} : ${String(ligne.last_error).slice(0, 40)}`;
  });

  await etape("le porteur ne prend rien d'autre que du WhatsApp", async () => {
    const uid = await creerCompte();
    // Sans numero ni consentement, le routage retombe sur le courriel.
    await c.query(
      `insert into public.profiles (id, canal_prefere) values ($1, 'email')
       on conflict (id) do update set canal_prefere = 'email'`,
      [uid]
    );
    await c.query(`select public.notify_enqueue($1, null, 'recette_mail', 'Sujet', 'Corps')`, [uid]);

    await c.query(`select public.whatsapp_porter_la_file(50)`);
    const courriel = (
      await c.query(
        `select state::text from public.notification_outbox
          where event = 'recette_mail' order by created_at desc limit 1`
      )
    ).rows[0];
    if (courriel.state !== "pending") {
      throw new Error(`le porteur WhatsApp a touche un courriel : ${courriel.state}`);
    }
    return "le courriel reste en attente de son porteur";
  });

  await etape("la sante du porteur est reservee au personnel", async () => {
    const uid = await creerCompte();
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const vu = (await c.query(`select public.whatsapp_sante() s`)).rows[0].s;
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (vu !== null) throw new Error("un compte ordinaire lit la sante du porteur");
    return "invisible";
  });

  if (numeroReel) {
    await etape(`envoi reel a ${numeroReel}`, async () => {
      const requete = (
        await c.query(`select public.whatsapp_envoyer($1, $2) r`, [
          numeroReel,
          "Akwaba : message de recette. Si vous le recevez, le porteur WhatsApp fonctionne.",
        ])
      ).rows[0].r;

      // pg_net repond de facon asynchrone : on attend la reponse plutot que de
      // declarer l'envoi reussi sur la seule remise au transporteur.
      await c.query(`select pg_sleep(4)`);
      const reponse = (
        await c.query(
          `select status_code, left(content, 300) contenu
             from net._http_response where id = $1`,
          [requete]
        )
      ).rows[0];

      if (!reponse) throw new Error(`aucune reponse pour la requete #${requete}`);
      if (reponse.status_code >= 400) {
        throw new Error(`Twilio ${reponse.status_code} : ${reponse.contenu}`);
      }
      return `Twilio ${reponse.status_code}`;
    });
  }
} catch (e) {
  echecs.push("interrompu : " + e.message);
  console.error("interrompu :", e.message);
} finally {
  // Un envoi reel doit rester : le message est parti, l'effacer de la trace
  // ferait mentir le journal.
  await c.query(numeroReel ? "commit" : "rollback");
  await c.end();
}

console.log(`\n${n - echecs.length}/${n} etapes vertes`);
if (!numeroReel) console.log("(transaction annulee : la base est intacte)");
if (echecs.length) {
  for (const e of echecs) console.error("  " + e);
  process.exit(1);
}
