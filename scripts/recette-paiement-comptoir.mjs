/**
 * Recette du paiement au comptoir.
 *
 * Tout le dispositif tient sur une promesse : l'argent ne passe jamais par le
 * shopper. Une promesse qu'on ne voit jamais tenir pourrait n'etre qu'une
 * intention. Cette recette essaie donc de la briser, par tous les chemins
 * qu'un shopper mal intentionne emprunterait.
 *
 * Contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-paiement-comptoir.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette du comptoir"));
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
      [`comptoir-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

const commeSi = async (uid) =>
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

/** Une course en cours, son client, son shopper, et un marchand verifie. */
const scene = async () => {
  const client = await creerCompte();
  const shopper = await creerCompte();
  const commercant = await creerCompte();

  await commeSi(client);
  const course = (
    await c.query(
      `select (public.errand_create(
         'Course de recette comptoir', 'grocery'::errand_category, 'Abidjan', null,
         'Adresse de recette', '[{"label":"Riz","qty":1}]'::jsonb, 20000,
         null, 'chat', null, 'wave'::pay_method, 'moto', 'small', 'standard',
         10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
       )).id as id`
    )
  ).rows[0].id;
  await anonyme();

  // Le marqueur du moteur : la garde des colonnes refuse toute ecriture directe
  // sur les montants et le statut d'une course. Qui l'arme le desarme.
  //
  // On ne pose ici que ce que le parcours reel pose : l'affectation et le
  // statut. Renseigner budget_approved_amount, comme le faisait cette recette,
  // fabriquait un etat que le produit ne produit jamais a ce stade, et masquait
  // ainsi le fait que la garde du plafond etait inerte.
  await c.query(`select set_config('app.errand_engine', 'on', true)`);
  await c.query(
    `update public.errands set runner_id = $1, status = 'shopping' where id = $2`,
    [shopper, course]
  );
  await c.query(`select set_config('app.errand_engine', 'off', true)`);

  const admin = await creerCompte();
  await c.query(
    `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_finance')`,
    [admin]
  );
  await commeSi(admin);
  const marchand = (
    await c.query(
      `select public.merchant_enregistrer('Supermarche de recette', 'wave'::momo_provider,
                                          $1::text, 'Abidjan', null, $2::uuid, true) ->> 'id' as id`,
      [`0700${String(compteur).padStart(6, "0")}`, commercant]
    )
  ).rows[0].id;
  await anonyme();

  return { client, shopper, commercant, admin, course, marchand };
};

const emettre = async (client, course, plafond = 15000) => {
  await commeSi(client);
  const r = (
    await c.query(`select public.counter_payment_emettre($1, $2, 90) j`, [course, plafond])
  ).rows[0].j;
  await anonyme();
  return r;
};

try {
  await etape("le client ouvre un paiement et recoit un code, une seule fois", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course);
    if (!bon.code || bon.code.length !== 16) throw new Error(`code ${bon.code}`);
    const enBase = (
      await c.query(`select code_hash from public.counter_payments where id = $1`, [bon.id])
    ).rows[0].code_hash;
    if (enBase === bon.code) throw new Error("le code est conserve en clair");
    if (enBase.length !== 64) throw new Error("l'empreinte n'est pas un sha256");
    return `code de 16 signes, empreinte seule en base`;
  });

  await etape("le shopper ne peut pas s'ouvrir un droit de depense", async () => {
    // C'est la premiere porte : si le shopper pouvait emettre, il fixerait
    // lui-meme le plafond sur l'argent d'un autre.
    const s = await scene();
    const r = await essayer(s.shopper, `select public.counter_payment_emettre($1, 15000, 90) j`, [
      s.course,
    ]);
    if (r.ok) throw new Error("le shopper a ouvert un paiement");
    if (!sansAccent(r.message).includes("seul le client")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("un inconnu ne peut pas ouvrir de paiement sur la course d'autrui", async () => {
    const s = await scene();
    const intrus = await creerCompte();
    const r = await essayer(intrus, `select public.counter_payment_emettre($1, 15000, 90) j`, [
      s.course,
    ]);
    if (r.ok) throw new Error("un inconnu a ouvert un paiement");
    return "refuse";
  });

  await etape("le plafond ne depasse pas le budget de la course", async () => {
    // Le budget connu au moment de l'emission est l'estimation donnee a la
    // publication : le panier n'existe pas encore, et rien n'a ete achete.
    const s = await scene();
    const r = await essayer(s.client, `select public.counter_payment_emettre($1, 999999, 90) j`, [
      s.course,
    ]);
    if (r.ok) throw new Error("un plafond hors budget a ete accepte");
    if (!sansAccent(r.message).includes("depasse le budget")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("le plafond est borne des l'affectation, avant tout panier", async () => {
    // Le defaut trouve par la revue adverse : a « assigned », basket_total et
    // budget_approved_amount sont vides et items_total vaut zero. Sans
    // budget_estimate dans la borne, deux codes de 500 000 FCFA passaient sur
    // une course de 20 000.
    const client = await creerCompte();
    await commeSi(client);
    const course = (
      await c.query(
        `select (public.errand_create(
           'Course sans panier', 'grocery'::errand_category, 'Abidjan', null,
           'Adresse de recette', '[{"label":"Riz","qty":1}]'::jsonb, 20000,
           null, 'chat', null, 'wave'::pay_method, 'moto', 'small', 'standard',
           10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
         )).id as id`
      )
    ).rows[0].id;
    await anonyme();
    const shopper = await creerCompte();
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    await c.query(`update public.errands set runner_id = $1, status = 'assigned' where id = $2`, [
      shopper,
      course,
    ]);
    await c.query(`select set_config('app.errand_engine', 'off', true)`);

    const etat = (
      await c.query(
        `select items_total, budget_estimate, budget_approved_amount, basket_total
           from public.errands where id = $1`,
        [course]
      )
    ).rows[0];
    if (Number(etat.items_total) !== 0 || etat.basket_total !== null) {
      throw new Error("l'etat de depart n'est plus celui du parcours reel");
    }

    const r = await essayer(client, `select public.counter_payment_emettre($1, 500000, 90) j`, [
      course,
    ]);
    if (r.ok) throw new Error("500 000 FCFA acceptes sur une course de 20 000");
    if (!sansAccent(r.message).includes("depasse le budget")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("une course sans budget connu n'ouvre aucun paiement", async () => {
    // Autoriser sans borne serait pire que refuser : personne ne saurait dire
    // ce qui a ete autorise.
    const client = await creerCompte();
    await commeSi(client);
    const course = (
      await c.query(
        `select (public.errand_create(
           'Course sans budget', 'grocery'::errand_category, 'Abidjan', null,
           'Adresse de recette', '[{"label":"Riz","qty":1}]'::jsonb, 20000,
           null, 'chat', null, 'wave'::pay_method, 'moto', 'small', 'standard',
           10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
         )).id as id`
      )
    ).rows[0].id;
    await anonyme();
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    await c.query(
      `update public.errands set status = 'assigned', budget_estimate = 0 where id = $1`,
      [course]
    );
    await c.query(`select set_config('app.errand_engine', 'off', true)`);
    const r = await essayer(client, `select public.counter_payment_emettre($1, 5000, 90) j`, [course]);
    if (r.ok) throw new Error("un paiement a ete ouvert sans budget");
    if (!sansAccent(r.message).includes("budget connu")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("un second code est refuse par la base, pas seulement par la garde", async () => {
    // Une garde en plpgsql se contourne par un appel concurrent : deux appels
    // simultanes passent tous deux la verification avant que l'un n'ait ecrit.
    // Seul un index unique les departage.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 10000);
    let msg = "";
    try {
      await c.query("savepoint contournement");
      await c.query(
        `insert into public.counter_payments (errand_id, code_hash, plafond, expire_le, emis_par, etat)
         values ($1, 'empreinte-de-recette', 1000, now() + interval '1 hour', $2, 'ouvert')`,
        [s.course, s.client]
      );
      await c.query("release savepoint contournement");
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint contournement");
    }
    if (!msg) throw new Error("un second code vivant a ete insere directement");
    if (!/unique|duplicate/i.test(msg)) throw new Error(msg);
    if (!bon.id) throw new Error("le premier code manque");
    return "index unique";
  });

  await etape("deux codes ouverts a la fois sur la meme course sont refuses", async () => {
    // Deux droits de depense simultanes permettraient de payer deux fois le
    // meme panier, et le client ne s'en apercevrait qu'au relevé.
    const s = await scene();
    await emettre(s.client, s.course, 15000);
    const r = await essayer(s.client, `select public.counter_payment_emettre($1, 15000, 90) j`, [
      s.course,
    ]);
    if (r.ok) throw new Error("un second code a ete ouvert");
    return "refuse";
  });

  await etape("le marchand lit le code sans le consommer", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course);
    await commeSi(s.commercant);
    const vu = (await c.query(`select public.counter_payment_lire($1) j`, [bon.code])).rows[0].j;
    await anonyme();
    if (Number(vu.plafond) !== 15000) throw new Error(`plafond lu ${vu.plafond}`);
    if (!vu.intitule) throw new Error("l'intitule manque");
    const etat = (
      await c.query(`select etat from public.counter_payments where id = $1`, [bon.id])
    ).rows[0].etat;
    if (etat !== "ouvert") throw new Error(`lire a consomme le code : ${etat}`);
    return `plafond ${vu.plafond}, code toujours ouvert`;
  });

  await etape("LA GARDE : le shopper inscrit comme marchand ne peut pas encaisser", async () => {
    // Le contournement evident. Sans cette garde, tout le dispositif ne
    // servirait a rien : le shopper se paierait lui-meme, legalement.
    const s = await scene();
    await commeSi(s.admin);
    const sien = (
      await c.query(
        `select public.merchant_enregistrer('Boutique du shopper', 'wave'::momo_provider,
                                            $1::text, 'Abidjan', null, $2::uuid, true) ->> 'id' as id`,
        [`0777${String(compteur).padStart(6, "0")}`, s.shopper]
      )
    ).rows[0].id;
    await anonyme();

    const bon = await emettre(s.client, s.course);
    const r = await essayer(
      s.shopper,
      `select public.counter_payment_demander($1, 10000, $2) j`,
      [bon.code, sien]
    );
    if (r.ok) throw new Error("LE SHOPPER S'EST PAYE LUI-MEME");
    if (!sansAccent(r.message).includes("shopper de la course")) throw new Error(r.message);
    return r.message.slice(0, 55);
  });

  await etape("le client non plus ne peut pas s'encaisser", async () => {
    const s = await scene();
    await commeSi(s.admin);
    const sien = (
      await c.query(
        `select public.merchant_enregistrer('Boutique du client', 'wave'::momo_provider,
                                            $1::text, 'Abidjan', null, $2::uuid, true) ->> 'id' as id`,
        [`0788${String(compteur).padStart(6, "0")}`, s.client]
      )
    ).rows[0].id;
    await anonyme();
    const bon = await emettre(s.client, s.course);
    const r = await essayer(s.client, `select public.counter_payment_demander($1, 10000, $2) j`, [
      bon.code,
      sien,
    ]);
    if (r.ok) throw new Error("le client s'est paye lui-meme");
    return r.message.slice(0, 45);
  });

  await etape("un marchand non verifie ne peut pas encaisser", async () => {
    const s = await scene();
    await commeSi(s.admin);
    const brouillon = (
      await c.query(
        `select public.merchant_enregistrer('Marchand non verifie', 'wave'::momo_provider,
                                            $1::text, 'Abidjan', null, null, false) ->> 'id' as id`,
        [`0799${String(compteur).padStart(6, "0")}`]
      )
    ).rows[0].id;
    await anonyme();
    const bon = await emettre(s.client, s.course);
    const r = await essayer(s.admin, `select public.counter_payment_demander($1, 10000, $2) j`, [
      bon.code,
      brouillon,
    ]);
    if (r.ok) throw new Error("un marchand non verifie a encaisse");
    if (!sansAccent(r.message).includes("verifi")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("le montant demande ne depasse pas le plafond du client", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 10000);
    const r = await essayer(
      s.commercant,
      `select public.counter_payment_demander($1, 12000, $2) j`,
      [bon.code, s.marchand]
    );
    if (r.ok) throw new Error("un montant hors plafond a ete accepte");
    if (!sansAccent(r.message).includes("depasse le plafond")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("le shopper ne peut pas demander l'encaissement a la place du marchand", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course);
    const r = await essayer(s.shopper, `select public.counter_payment_demander($1, 9000, $2) j`, [
      bon.code,
      s.marchand,
    ]);
    if (r.ok) throw new Error("le shopper a fixe le montant");
    return "refuse";
  });

  await etape("le parcours nominal : demande, validation, trace", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);

    await commeSi(s.commercant);
    const demande = (
      await c.query(`select public.counter_payment_demander($1, 12500, $2) j`, [bon.code, s.marchand])
    ).rows[0].j;
    await anonyme();
    if (demande.etat !== "a_valider") throw new Error(`etat ${demande.etat}`);

    await commeSi(s.client);
    const decision = (
      await c.query(`select public.counter_payment_decider($1, true, null) j`, [bon.id])
    ).rows[0].j;
    await anonyme();
    if (decision.etat !== "regle") throw new Error(`etat ${decision.etat}`);

    const paiement = (
      await c.query(
        `select payer_id, kind::text, amount from public.errand_payments
          where errand_id = $1 and reference like 'comptoir:%'`,
        [s.course]
      )
    ).rows[0];
    if (!paiement) throw new Error("aucune ligne comptable");
    if (paiement.payer_id !== s.client) throw new Error("le payeur n'est pas le client");
    if (Number(paiement.amount) !== 12500) throw new Error(`montant ${paiement.amount}`);

    // Rien ne doit avoir credite le shopper : c'est tout le propos.
    const versShopper = (
      await c.query(
        `select count(*)::int n from public.wallet_entries
          where user_id = $1 and errand_id = $2 and kind <> 'commission_due'`,
        [s.shopper, s.course]
      )
    ).rows[0].n;
    if (versShopper > 0) throw new Error(`${versShopper} ligne(s) au credit du shopper`);

    return "paye au marchand, rien au shopper";
  });

  await etape("un code deja regle ne se represente pas", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, true, null)`, [bon.id]);
    await anonyme();

    const r = await essayer(
      s.commercant,
      `select public.counter_payment_demander($1, 3000, $2) j`,
      [bon.code, s.marchand]
    );
    if (r.ok) throw new Error("un code regle a resservi");
    return "refuse";
  });

  await etape("le client refuse, et le shopper est prevenu de ne rien avancer", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, false, 'Prix trop eleve') j`, [bon.id]);
    await anonyme();

    const p = (
      await c.query(`select etat, motif from public.counter_payments where id = $1`, [bon.id])
    ).rows[0];
    if (p.etat !== "refuse") throw new Error(`etat ${p.etat}`);

    const avis = (
      await c.query(
        `select count(*)::int n from public.notification_outbox
          where user_id = $1 and event = 'counter_payment_refuse'`,
        [s.shopper]
      )
    ).rows[0].n;
    if (avis === 0) throw new Error("le shopper n'a pas ete prevenu");
    return "refuse, shopper prevenu";
  });

  await etape("seul le client decide, pas le marchand ni le shopper", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();

    for (const [qui, uid] of [
      ["le marchand", s.commercant],
      ["le shopper", s.shopper],
    ]) {
      const r = await essayer(uid, `select public.counter_payment_decider($1, true, null) j`, [bon.id]);
      if (r.ok) throw new Error(`${qui} a valide a la place du client`);
    }
    return "les deux sont refuses";
  });

  await etape("un code expire ne sert plus, et rien n'a bouge", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await c.query(`update public.counter_payments set expire_le = now() - interval '1 minute' where id = $1`, [bon.id]);
    const expires = (await c.query(`select public.counter_payments_expirer() n`)).rows[0].n;
    if (expires < 1) throw new Error("l'expiration n'a rien traite");

    const r = await essayer(
      s.commercant,
      `select public.counter_payment_demander($1, 5000, $2) j`,
      [bon.code, s.marchand]
    );
    if (r.ok) throw new Error("un code expire a servi");

    const lignes = (
      await c.query(`select count(*)::int n from public.errand_payments where errand_id = $1`, [s.course])
    ).rows[0].n;
    if (lignes > 0) throw new Error("un paiement a ete enregistre malgre l'expiration");
    return "expire, aucune ecriture";
  });

  await etape("le client annule tant que rien n'est valide", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.client);
    await c.query(`select public.counter_payment_annuler($1)`, [bon.id]);
    await anonyme();
    const etat = (
      await c.query(`select etat from public.counter_payments where id = $1`, [bon.id])
    ).rows[0].etat;
    if (etat !== "annule") throw new Error(`etat ${etat}`);
    return "annule";
  });

  await etape("un paiement valide ne s'annule pas en silence", async () => {
    // L'annulation d'un paiement deja fait effacerait la trace de ce que le
    // client doit au marchand. Ce cas releve du litige, pas d'un bouton.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, true, null)`, [bon.id]);
    await anonyme();
    const r = await essayer(s.client, `select public.counter_payment_annuler($1) j`, [bon.id]);
    if (r.ok) throw new Error("un paiement valide a ete annule");
    if (!sansAccent(r.message).includes("litige")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("le numero du marchand n'est pas lisible par un client", async () => {
    // Le diffuser inviterait a payer hors du dispositif, sans trace, et le
    // client perdrait tout recours.
    await c.query("set local role authenticated");
    let refuse = false;
    try {
      await c.query(`select numero from public.merchant_accounts limit 1`);
    } catch (e) {
      refuse = /permission|denied|droit/i.test(e.message);
      await c.query("rollback to savepoint etape");
    }
    await c.query("reset role");
    if (!refuse) throw new Error("le numero du marchand est lisible");
    return "colonne refusee";
  });

  await etape("le shopper retrouve le code qu'il doit presenter", async () => {
    // Le defaut le plus grave trouve par la revue : le client emettait le code,
    // le voyait une fois, et la base n'en gardait qu'une empreinte. Le shopper,
    // seul au comptoir, n'avait rien a montrer.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    const r = await essayer(s.shopper, `select public.counter_payment_code($1) c`, [bon.id]);
    if (!r.ok) throw new Error(r.message);
    if (r.valeur.c !== bon.code) throw new Error("le code relu differe de celui emis");
    return "identique a l'emission";
  });

  await etape("le client aussi peut relire son code", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    const r = await essayer(s.client, `select public.counter_payment_code($1) c`, [bon.id]);
    if (!r.ok) throw new Error(r.message);
    if (r.valeur.c !== bon.code) throw new Error("code different");
    return "relu";
  });

  await etape("personne d'autre ne relit le code, pas meme le support", async () => {
    // Connaitre le code permettrait de le presenter soi-meme : c'est une
    // capacite que le support n'a aucune raison d'avoir.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    for (const [qui, uid] of [
      ["le support", s.admin],
      ["le marchand", s.commercant],
    ]) {
      const r = await essayer(uid, `select public.counter_payment_code($1) c`, [bon.id]);
      if (r.ok) throw new Error(`${qui} a relu le code`);
    }
    return "les deux sont refuses";
  });

  await etape("chaque relecture du code laisse une trace", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await essayer(s.shopper, `select public.counter_payment_code($1) c`, [bon.id]);
    const n = (
      await c.query(
        `select count(*)::int n from public.audit_logs
          where action = 'counter_payment_code' and entity_id = $1 and actor_id = $2`,
        [bon.id, s.shopper]
      )
    ).rows[0].n;
    if (n === 0) throw new Error("aucune trace de relecture");
    return `${n} trace(s)`;
  });

  await etape("le numero du shopper ne peut pas servir de numero de marchand", async () => {
    // La console ne rattache aucun compte : la garde par le compte etait donc
    // inerte pour tous les marchands qu'elle inscrit. On compare aussi les
    // numeros d'encaissement declares par le shopper.
    const s = await scene();
    const numero = `0755${String(compteur).padStart(6, "0")}`;
    await c.query(
      `insert into public.runner_payout_accounts (user_id, provider, account_number, account_name, is_default)
       values ($1, 'wave'::momo_provider, $2, 'Shopper de recette', true)`,
      [s.shopper, numero]
    );
    await commeSi(s.admin);
    const complice = (
      await c.query(
        `select public.merchant_enregistrer('Faux marchand', 'wave'::momo_provider,
                                            $1::text, 'Abidjan', null, null, true) ->> 'id' as id`,
        [numero]
      )
    ).rows[0].id;
    await anonyme();

    const bon = await emettre(s.client, s.course, 15000);
    const r = await essayer(s.admin, `select public.counter_payment_demander($1, 10000, $2) j`, [
      bon.code,
      complice,
    ]);
    if (r.ok) throw new Error("LE NUMERO DU SHOPPER A ENCAISSE");
    if (!sansAccent(r.message).includes("celui du shopper")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("un droit de lecture seule ne permet pas de saisir un encaissement", async () => {
    // Le second defaut critique : « paiements.comptoir.lire », declare non
    // sensible, autorisait a engager l'argent du client.
    const s = await scene();
    const lecteur = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`,
      [lecteur]
    );
    const droits = (
      await c.query(`select public.has_permission($1, 'paiements.comptoir.lire') l,
                            public.has_permission($1, 'paiements.comptoir.saisir') s`, [lecteur])
    ).rows[0];
    if (!droits.l) throw new Error("le role de reference n'a plus le droit de lire");
    if (droits.s) throw new Error("le role de lecture porte aussi le droit de saisir");

    const bon = await emettre(s.client, s.course, 15000);
    const r = await essayer(lecteur, `select public.counter_payment_demander($1, 9000, $2) j`, [
      bon.code,
      s.marchand,
    ]);
    if (r.ok) throw new Error("un droit de lecture a engage l'argent du client");
    return "refuse";
  });

  await etape("le marchand constate qu'il a ete paye", async () => {
    // Sans cela, il n'a aucun moyen de rapprocher un encaissement d'une course.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, true, null)`, [bon.id]);
    await anonyme();

    await commeSi(s.commercant);
    await c.query("set local role authenticated");
    const vus = (await c.query(`select id, etat from public.counter_payments`)).rows;
    await c.query("reset role");
    await anonyme();
    if (!vus.some((x) => x.id === bon.id && x.etat === "regle")) {
      throw new Error("le marchand ne voit pas son encaissement");
    }

    const avis = (
      await c.query(
        `select count(*)::int n from public.notification_outbox
          where user_id = $1 and event = 'counter_payment_valide_marchand'`,
        [s.commercant]
      )
    ).rows[0].n;
    if (avis === 0) throw new Error("le marchand n'a pas ete prevenu");
    return "visible et notifie";
  });

  await etape("un client ordinaire ne lit pas le registre des marchands", async () => {
    // Le registre porte les identifiants de comptes rattaches : il n'a aucune
    // raison d'etre ouvert a tous les connectes.
    const s = await scene();
    await commeSi(s.client);
    await c.query("set local role authenticated");
    const vus = (await c.query(`select id from public.merchant_accounts`)).rows.length;
    await c.query("reset role");
    await anonyme();
    if (vus > 0) throw new Error(`${vus} marchand(s) lisibles par un client`);
    return "aucun";
  });

  await etape("aucun message n'annonce un virement qui n'a pas eu lieu", async () => {
    // Aucun prestataire n'est raccorde. Dire « paye » au shopper le pousserait
    // a remettre la marchandise sur la foi d'un reglement qui n'existe pas.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, true, null)`, [bon.id]);
    await anonyme();

    const messages = (
      await c.query(
        `select subject, body from public.notification_outbox
          where errand_id = $1 and event like 'counter_payment_valide%'`,
        [s.course]
      )
    ).rows;
    if (messages.length === 0) throw new Error("aucun avis emis");
    for (const m of messages) {
      const texte = sansAccent(`${m.subject} ${m.body}`);
      if (/\bpaye\b|\bpayee\b|a ete paye/.test(texte)) {
        throw new Error(`un avis annonce un paiement effectue : ${m.subject}`);
      }
    }
    return `${messages.length} avis, aucun ne dit « paye »`;
  });

  await etape("un marchand par virement bancaire est refuse des l'inscription", async () => {
    // Le type pay_method ne connait pas « bank » : la conversion echouait a la
    // validation, au comptoir, une fois le panier rempli. Il vaut mieux le dire
    // au moment de l'inscription.
    const admin = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_finance')`,
      [admin]
    );
    const r = await essayer(
      admin,
      `select public.merchant_enregistrer('Banque de recette', 'bank'::momo_provider,
                                          $1::text, 'Abidjan', null, null, true) j`,
      [`0733${String(compteur).padStart(6, "0")}`]
    );
    if (r.ok) throw new Error("un marchand bancaire a ete inscrit");
    if (!sansAccent(r.message).includes("virement bancaire")) throw new Error(r.message);
    return r.message.slice(0, 50);
  });

  await etape("une course annulee ne laisse plus rien passer au comptoir", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    await c.query(`update public.errands set status = 'cancelled' where id = $1`, [s.course]);
    await c.query(`select set_config('app.errand_engine', 'off', true)`);
    const r = await essayer(s.commercant, `select public.counter_payment_demander($1, 5000, $2) j`, [
      bon.code,
      s.marchand,
    ]);
    if (r.ok) throw new Error("un encaissement a ete demande sur une course annulee");
    // Deux refus valent ici, et les deux sont bons : la garde de l'annulation a
    // pu refermer le code avant meme que le controle de la course ne parle.
    const raison = sansAccent(r.message);
    if (!raison.includes("plus en cours") && !raison.includes("annule")) {
      throw new Error(r.message);
    }
    return r.message.slice(0, 45);
  });

  await etape("annuler une course avec un paiement en attente est refuse", async () => {
    // Le client doit trancher : sinon le code reste presentable au comptoir sur
    // une course qui n'existe plus, et le commercant a deja commence a emballer.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    let msg = "";
    try {
      await c.query("savepoint annulation");
      await c.query(`select set_config('app.errand_engine', 'on', true)`);
      await c.query(`update public.errands set status = 'cancelled' where id = $1`, [s.course]);
      await c.query("release savepoint annulation");
    } catch (e) {
      msg = e.message;
      await c.query("rollback to savepoint annulation");
    }
    await c.query(`select set_config('app.errand_engine', 'off', true)`);
    if (!msg) throw new Error("la course a ete annulee avec un paiement en attente");
    if (!sansAccent(msg).includes("attend votre decision")) throw new Error(msg);
    return msg.slice(0, 50);
  });

  await etape("un marchand suspendu entre la demande et la validation n'encaisse pas", async () => {
    // L'argent n'est engage qu'a la validation : c'est la qu'il faut revérifier,
    // et non seulement a la demande.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.admin);
    await c.query(`select public.merchant_basculer($1, false)`, [s.marchand]);
    await anonyme();
    const r = await essayer(s.client, `select public.counter_payment_decider($1, true, null) j`, [bon.id]);
    if (r.ok) throw new Error("un marchand suspendu a encaisse");
    if (!sansAccent(r.message).includes("pas actif")) throw new Error(r.message);
    return r.message.slice(0, 40);
  });

  await etape("le montant valide compte comme une avance du client", async () => {
    // Sans cela, le reglement final ignore que le panier est deja finance, et
    // le client le paie une seconde fois.
    const s = await scene();
    const avant = (
      await c.query(`select coalesce(advance_amount, 0) a from public.errands where id = $1`, [s.course])
    ).rows[0].a;
    const bon = await emettre(s.client, s.course, 15000);
    await commeSi(s.commercant);
    await c.query(`select public.counter_payment_demander($1, 12000, $2)`, [bon.code, s.marchand]);
    await anonyme();
    await commeSi(s.client);
    await c.query(`select public.counter_payment_decider($1, true, null)`, [bon.id]);
    await anonyme();
    const apres = (
      await c.query(
        `select coalesce(advance_amount, 0) a, advance_confirmed_at from public.errands where id = $1`,
        [s.course]
      )
    ).rows[0];
    if (Number(apres.a) - Number(avant) !== 12000) {
      throw new Error(`avance passee de ${avant} a ${apres.a}`);
    }
    if (!apres.advance_confirmed_at) throw new Error("l'avance n'est pas confirmee");
    return `avance ${avant} -> ${apres.a}`;
  });

  await etape("une expiration annoncee n'est jamais ecrite a moitie", async () => {
    // Le code marquait « expire » puis levait une exception : le RAISE annulait
    // l'ecriture. Il ne pretend plus ranger ce qu'il ne range pas.
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    await c.query(`update public.counter_payments set expire_le = now() - interval '1 minute' where id = $1`, [bon.id]);
    const r = await essayer(s.commercant, `select public.counter_payment_lire($1) j`, [bon.code]);
    if (r.ok) throw new Error("un code expire a ete lu");
    const etat = (
      await c.query(`select etat from public.counter_payments where id = $1`, [bon.id])
    ).rows[0].etat;
    // L'etat reste « ouvert » jusqu'au passage du travail planifie : c'est
    // honnete, et c'est lui qui range pour de bon.
    if (etat !== "ouvert") throw new Error(`etat ${etat}, attendu ouvert`);
    const n = (await c.query(`select public.counter_payments_expirer() n`)).rows[0].n;
    const apres = (
      await c.query(`select etat from public.counter_payments where id = $1`, [bon.id])
    ).rows[0].etat;
    if (apres !== "expire") throw new Error(`apres le travail planifie : ${apres}`);
    return `range par le travail planifie (${n})`;
  });

  await etape("rattacher un compte marchand ouvre l'acces au comptoir", async () => {
    // Sans rattachement, la politique de lecture ne montre rien au commercant :
    // le registre existait, mais personne ne pouvait s'en servir.
    const s = await scene();
    const gerant = await creerCompte();
    const courriel = `comptoir-${compteur}@exemple.test`;
    await c.query(`update auth.users set email = $1 where id = $2`, [courriel, gerant]);
    await commeSi(s.admin);
    await c.query(`select public.merchant_rattacher($1, $2)`, [s.marchand, courriel]);
    await anonyme();

    await commeSi(gerant);
    await c.query("set local role authenticated");
    const vus = (await c.query(`select id from public.merchant_accounts`)).rows.length;
    await c.query("reset role");
    await anonyme();
    if (vus !== 1) throw new Error(`le gerant voit ${vus} marchand(s)`);
    return "un seul, le sien";
  });

  await etape("le shopper voit le paiement de sa course, pas ceux des autres", async () => {
    const s = await scene();
    const bon = await emettre(s.client, s.course, 15000);
    const autre = await scene();
    await emettre(autre.client, autre.course, 15000);

    await commeSi(s.shopper);
    await c.query("set local role authenticated");
    const vus = (
      await c.query(`select id from public.counter_payments`)
    ).rows.map((r) => r.id);
    await c.query("reset role");
    await anonyme();

    if (!vus.includes(bon.id)) throw new Error("le shopper ne voit pas le paiement de sa course");
    if (vus.length !== 1) throw new Error(`il voit ${vus.length} paiement(s)`);
    return "un seul, le sien";
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
