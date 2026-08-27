/**
 * Recette du financement des achats.
 *
 * Le sujet le plus lourd du produit : qui avance l'argent, et qui se retrouve
 * expose si l'autre se derobe. Une garde qui protege le shopper doit refuser
 * quand elle est mise a l'epreuve, sinon elle ne protege personne.
 *
 * Contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-financement.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette du financement"));
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
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $1::text, '', now(), '', '', '', '', now(), now())
       returning id`,
      [`financement-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

/** Un shopper habilite, dont on choisit l'anciennete et le palmares. */
const creerShopper = async (courses = 0, note = 0, jours = 0) => {
  const uid = await creerCompte();
  await c.query(
    `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status,
       date_of_birth, id_document_type, id_doc_url, selfie_url,
       jobs_completed, rating, created_at)
     values ($1, 'Shopper Financement', '0700000000', 'Abidjan', 'moto', 'approved',
       '1990-01-01', 'cni', 'u/p.jpg', 'u/s.jpg', $2, $3, now() - ($4 || ' days')::interval)`,
    [uid, courses, note, jours]
  );
  return uid;
};

const sous = async (uid) =>
  c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

/** Une course reelle, publiee par le moteur, dans le mode demande. */
const creerCourse = async (client, mode = "customer_advance", budget = 10000) => {
  await sous(client);
  const r = await c.query(
    `select (public.errand_create(
       'Course de recette financement', 'grocery'::errand_category, 'Abidjan', null,
       'Adresse de remise de recette', '[{"label":"Riz","qty":1}]'::jsonb, $1,
       null, 'chat', null, 'cash'::pay_method, 'moto', 'small', 'standard',
       10, 45, 'runner_delivers'::dropoff_mode, null, $2::fund_mode
     )).id as id`,
    [budget, mode]
  );
  await c.query(`select set_config('request.jwt.claims', null, true)`);
  return r.rows[0].id;
};

/** Attribue la course au shopper, comme le ferait l'acceptation d'une offre. */
const attribuer = async (errandId, shopper, statut = "shopping") => {
  await c.query(`select set_config('app.errand_engine', 'on', true)`);
  await c.query(
    `update public.errands set runner_id = $2, status = $3::errand_status,
       accepted_at = now(), started_at = now() where id = $1`,
    [errandId, shopper, statut]
  );
  await c.query(`select set_config('app.errand_engine', 'off', true)`);
};

const course = async (id) =>
  (
    await c.query(
      `select fund_mode::text, budget_estimate, items_total, basket_total,
              basket_submitted_at, basket_approved_at, basket_rejected_at, basket_note,
              advance_declared_amount, status::text
         from public.errands where id = $1`,
      [id]
    )
  ).rows[0];

try {
  // ------------------------------------------------------------------------
  // Les paliers de confiance
  // ------------------------------------------------------------------------

  await etape("un shopper neuf porte le plafond d'entree, pas celui des anciens", async () => {
    const neuf = await creerShopper(0, 0, 0);
    const plafond = Number(
      (await c.query(`select public.runner_advance_ceiling($1) p`, [neuf])).rows[0].p
    );
    if (plafond !== 15000) throw new Error(`plafond ${plafond} au lieu de 15000`);
    return `${plafond} FCFA`;
  });

  await etape("le plafond monte avec les courses menees a leur terme", async () => {
    const confirme = await creerShopper(6, 4.2, 10);
    const etabli = await creerShopper(30, 4.8, 60);
    const pc = Number((await c.query(`select public.runner_advance_ceiling($1) p`, [confirme])).rows[0].p);
    const pe = Number((await c.query(`select public.runner_advance_ceiling($1) p`, [etabli])).rows[0].p);
    if (pc !== 50000) throw new Error(`confirme : ${pc}`);
    if (pe !== 150000) throw new Error(`etabli : ${pe}`);
    return `confirme ${pc}, etabli ${pe}`;
  });

  await etape("une note trop basse ne fait pas monter de palier", async () => {
    // Beaucoup de courses ne suffisent pas : la note compte aussi, sans quoi
    // un shopper qui bacle en volume monterait aussi vite qu'un shopper soigneux.
    const volume = await creerShopper(40, 2.0, 60);
    const plafond = Number(
      (await c.query(`select public.runner_advance_ceiling($1) p`, [volume])).rows[0].p
    );
    if (plafond !== 15000) throw new Error(`plafond ${plafond} malgre une note de 2`);
    return "reste au plancher";
  });

  await etape("un shopper suspendu ne peut plus rien recevoir", async () => {
    const s = await creerShopper(30, 4.8, 60);
    await c.query(
      `update public.runner_profiles set status = 'suspended' where user_id = $1`, [s]
    );
    const plafond = Number(
      (await c.query(`select public.runner_advance_ceiling($1) p`, [s])).rows[0].p
    );
    if (plafond !== 0) throw new Error(`plafond ${plafond} pour un suspendu`);
    return "plafond a zero";
  });

  // ------------------------------------------------------------------------
  // Le plafond d'avance, applique par le serveur
  // ------------------------------------------------------------------------

  await etape("une avance au-dela du plafond est refusee", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "customer_advance", 200000);
    await attribuer(id, shopper, "assigned");

    await sous(client);
    let msg = "";
    try {
      await c.query(`select public.errand_declare_advance($1, 120000)`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("120 000 accepte pour un shopper plafonne a 15 000");
    if (!sansAccent(msg).includes("au plus")) throw new Error(`refus inattendu : ${msg}`);
    return msg.slice(0, 70);
  });

  await etape("une avance dans le plafond passe", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "customer_advance", 20000);
    await attribuer(id, shopper, "assigned");

    await sous(client);
    await c.query(`select public.errand_declare_advance($1, 12000)`, [id]);
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    const e = await course(id);
    if (Number(e.advance_declared_amount) !== 12000) {
      throw new Error(`declare ${e.advance_declared_amount}`);
    }
    return "12 000 sous le plafond de 15 000";
  });

  await etape("la garde peut refuser : sans le palier, l'enorme passerait", async () => {
    // Une garde qu'on ne voit jamais refuser pourrait etre inerte. On releve le
    // plancher, on constate que le montant passe, puis on remet.
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "customer_advance", 200000);
    await attribuer(id, shopper, "assigned");

    await c.query(`update public.runner_trust_levels set plafond_avance = 999999 where code = 'debutant'`);
    await sous(client);
    await c.query(`select public.errand_declare_advance($1, 120000)`, [id]);
    const e = await course(id);
    await c.query("rollback to savepoint etape");
    if (Number(e.advance_declared_amount) !== 120000) {
      throw new Error("le plafond n'etait pas la cause du refus");
    }
    return "le palier est bien la cause";
  });

  // ------------------------------------------------------------------------
  // La validation du panier avant paiement
  // ------------------------------------------------------------------------

  await etape("le shopper soumet son panier avant de payer", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, 'u/panier.jpg')`, [id]);
    await c.query(`select set_config('request.jwt.claims', null, true)`);

    const e = await course(id);
    if (!e.basket_submitted_at) throw new Error("rien n'a ete soumis");
    if (Number(e.basket_total) !== 9500) throw new Error(`total ${e.basket_total}`);
    return `panier a ${e.basket_total}`;
  });

  await etape("le shopper ne paie pas un panier non valide", async () => {
    // La garde qui protege le shopper : sans accord prealable, le client peut
    // refuser a l'arrivee, et la marchandise ne se rend pas.
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    let msg = "";
    try {
      await c.query(`select public.errand_save_invoice($1, 9500, 0, null, null)`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("la facture est passee sans validation du panier");
    if (!sansAccent(msg).includes("valider le panier")) throw new Error(`refus inattendu : ${msg}`);
    return msg.slice(0, 70);
  });

  await etape("apres validation, la facture passe", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, 'u/panier.jpg')`, [id]);
    await sous(client);
    await c.query(`select public.errand_decide_basket($1, true)`, [id]);
    await sous(shopper);
    await c.query(`select public.errand_save_invoice($1, 9500, 0, null, null)`, [id]);
    await c.query(`select set_config('request.jwt.claims', null, true)`);

    const e = await course(id);
    if (Number(e.items_total) !== 9500) throw new Error(`facture ${e.items_total}`);
    return "facture enregistree apres accord";
  });

  await etape("payer plus que le panier valide est refuse", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9000, 'u/panier.jpg')`, [id]);
    await sous(client);
    await c.query(`select public.errand_decide_basket($1, true)`, [id]);
    await sous(shopper);
    let msg = "";
    try {
      await c.query(`select public.errand_save_invoice($1, 10500, 0, null, null)`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("une facture superieure au panier valide est passee");
    if (!sansAccent(msg).includes("depasse le panier")) throw new Error(`refus inattendu : ${msg}`);
    return msg.slice(0, 70);
  });

  await etape("un refus de panier exige un motif utilisable", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, null)`, [id]);
    await sous(client);
    let msg = "";
    try {
      await c.query(`select public.errand_decide_basket($1, false, '')`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("un refus sans motif est passe");
    if (!sansAccent(msg).includes("ce qui ne va pas")) throw new Error(`refus inattendu : ${msg}`);
    return "motif exige";
  });

  await etape("le client ne revient pas sur un panier qu'il a valide", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, null)`, [id]);
    await sous(client);
    await c.query(`select public.errand_decide_basket($1, true)`, [id]);
    let msg = "";
    try {
      await c.query(`select public.errand_decide_basket($1, false, 'je change d avis')`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("le client est revenu sur son accord");
    if (!sansAccent(msg).includes("deja ete valide")) throw new Error(`refus inattendu : ${msg}`);
    return "accord irrevocable";
  });

  await etape("le client n'annule plus apres avoir valide le panier", async () => {
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, null)`, [id]);
    await sous(client);
    await c.query(`select public.errand_decide_basket($1, true)`, [id]);
    let msg = "";
    try {
      await c.query(`select public.errand_cancel($1, 'je change d avis')`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("annulation acceptee apres validation du panier");
    return msg.slice(0, 70);
  });

  await etape("un panier trois fois plus cher que le budget est refuse", async () => {
    // Ce n'est plus une variation, c'est un autre achat : il passe par la
    // demande de depassement, pas par une validation rapide sur telephone.
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    let msg = "";
    try {
      await c.query(`select public.errand_submit_basket($1, 30000, null)`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("un panier triple est passe sans demande de depassement");
    if (!sansAccent(msg).includes("depasse le budget")) throw new Error(`refus inattendu : ${msg}`);
    return msg.slice(0, 70);
  });

  await etape("un tiers ne valide pas le panier d'un autre", async () => {
    const client = await creerCompte();
    const intrus = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, null)`, [id]);
    await sous(intrus);
    let msg = "";
    try {
      await c.query(`select public.errand_decide_basket($1, true)`, [id]);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("un tiers a valide le panier");
    if (!sansAccent(msg).includes("seul le client")) throw new Error(`refus inattendu : ${msg}`);
    return "refuse";
  });

  await etape("le moderateur voit si le client avait approuve", async () => {
    // La question decisive d'un litige : le client conteste-t-il ce qu'il a
    // lui-meme valide ?
    const client = await creerCompte();
    const shopper = await creerShopper(0, 0, 0);
    const id = await creerCourse(client, "runner_advance", 10000);
    await attribuer(id, shopper);

    await sous(shopper);
    await c.query(`select public.errand_submit_basket($1, 9500, 'u/panier.jpg')`, [id]);
    await sous(client);
    await c.query(`select public.errand_decide_basket($1, true)`, [id]);

    const r = (await c.query(`select public.errand_financement_resume($1) r`, [id])).rows[0].r;
    await c.query(`select set_config('request.jwt.claims', null, true)`);
    if (!r) throw new Error("le resume n'est pas lisible par le client");
    if (r.client_avait_approuve !== true) throw new Error("l'approbation n'apparait pas");
    if (Number(r.panier_total) !== 9500) throw new Error(`total ${r.panier_total}`);
    if (!r.plafond_du_shopper) throw new Error("le plafond du shopper n'apparait pas");
    return `approuve, panier ${r.panier_total}, plafond ${r.plafond_du_shopper}`;
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
