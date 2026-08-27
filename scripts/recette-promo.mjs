/**
 * Recette des codes promotionnels.
 *
 * Une promotion se juge sur ce qu'elle ne fait pas. Elle ne doit jamais
 * reduire le gain du shopper, jamais rendre la commission negative, jamais
 * porter sur l'argent des achats, et jamais servir deux fois quand on l'a
 * limitee a une.
 *
 * Tout se passe contre la vraie base, dans une transaction annulee.
 *
 * Usage : node scripts/recette-promo.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette des promotions"));
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
      [`promo-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

/** Une course reelle, publiee par le moteur, avec ses vrais montants. */
const creerCourse = async (uid, ville = "Abidjan") => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  const r = await c.query(
    `select (public.errand_create(
       'Course de recette promo', 'grocery'::errand_category, $1, null,
       'Adresse de remise de recette', '[{"label":"Riz","qty":1}]'::jsonb, 10000,
       null, 'chat', null, 'cash'::pay_method, 'moto', 'small', 'standard',
       10, 45, 'runner_delivers'::dropoff_mode, null, 'customer_advance'::fund_mode
     )).id as id`,
    [ville]
  );
  await c.query(`select set_config('request.jwt.claims', null, true)`);
  return r.rows[0].id;
};

const course = async (id) =>
  (
    await c.query(
      `select service_fee, commission_amount, runner_payout, total_amount,
              promo_code, promo_discount, budget_estimate
         from public.errands where id = $1`,
      [id]
    )
  ).rows[0];

/**
 * Applique un code comme le ferait le client depuis son ecran.
 *
 * Le serveur exige desormais que ce soit le client de la course : appeler la
 * fonction sans identite, comme le faisait cette recette, ne represente aucun
 * usage reel.
 */
const appliquer = async (uid, id, code) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  const r = (await c.query(`select public.promo_appliquer($1, $2) e`, [id, code])).rows[0].e;
  await c.query(`select set_config('request.jwt.claims', null, true)`);
  return r;
};

const publier = async (champs) =>
  c.query(
    `insert into public.promo_codes (code, libelle, type, valeur, remise_max,
       frais_minimum, ville_slug, fin, usages_max, usages_par_personne, actif)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, true))`,
    [
      champs.code,
      champs.libelle ?? "Code de recette",
      champs.type ?? "fixed",
      champs.valeur,
      champs.remise_max ?? null,
      champs.frais_minimum ?? 0,
      champs.ville ?? null,
      champs.fin ?? null,
      champs.usages_max ?? null,
      champs.par_personne ?? 1,
      champs.actif ?? null,
    ]
  );

try {
  await etape("une remise fixe reduit ce que paie le client, pas le gain du shopper", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    const avant = await course(id);
    await publier({ code: "RECETTE-FIXE", type: "fixed", valeur: 200 });

    const r = await appliquer(uid, id, 'RECETTE-FIXE');
    if (!r.valide) throw new Error(`refuse : ${r.motif}`);

    const apres = await course(id);
    if (Number(apres.runner_payout) !== Number(avant.runner_payout)) {
      throw new Error(`le gain du shopper a bouge : ${avant.runner_payout} -> ${apres.runner_payout}`);
    }
    if (Number(apres.commission_amount) !== Number(avant.commission_amount) - 200) {
      throw new Error(`la commission n'a pas absorbe la remise : ${apres.commission_amount}`);
    }
    if (Number(apres.total_amount) !== Number(avant.total_amount) - 200) {
      throw new Error(`le client ne paie pas moins : ${apres.total_amount}`);
    }
    return `gain intact ${apres.runner_payout}, commission ${avant.commission_amount} -> ${apres.commission_amount}`;
  });

  await etape("une remise superieure a la commission est plafonnee, pas prise au shopper", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    const avant = await course(id);
    // La commission vaut 15 % des frais : une remise de 99 999 la depasse
    // largement, et c'est precisement le cas ou un shopper se ferait tondre.
    await publier({ code: "RECETTE-ENORME", type: "fixed", valeur: 99999 });

    const r = await appliquer(uid, id, 'RECETTE-ENORME');
    if (!r.valide) throw new Error(`refuse : ${r.motif}`);
    if (!r.plafonnee_par_commission) throw new Error("le plafonnement n'est pas signale");

    const apres = await course(id);
    if (Number(apres.runner_payout) !== Number(avant.runner_payout)) {
      throw new Error(`le gain du shopper a bouge : ${apres.runner_payout}`);
    }
    if (Number(apres.commission_amount) !== 0) {
      throw new Error(`commission ${apres.commission_amount} au lieu de 0`);
    }
    return `remise plafonnee a ${r.remise}, commission a 0, gain intact ${apres.runner_payout}`;
  });

  await etape("la remise ne touche jamais l'argent des achats", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    const avant = await course(id);
    await publier({ code: "RECETTE-ACHATS", type: "fixed", valeur: 99999 });
    await appliquer(uid, id, 'RECETTE-ACHATS');
    const apres = await course(id);
    if (Number(apres.budget_estimate) !== Number(avant.budget_estimate)) {
      throw new Error("le budget d'achat a ete entame");
    }
    // Le total ne peut pas descendre sous le prix des achats.
    if (Number(apres.total_amount) < Number(apres.budget_estimate)) {
      throw new Error(`total ${apres.total_amount} sous les achats ${apres.budget_estimate}`);
    }
    return `achats intacts a ${apres.budget_estimate}`;
  });

  await etape("un pourcentage respecte son plafond", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    await publier({ code: "RECETTE-PCT", type: "percent", valeur: 100, remise_max: 50 });
    const r = await appliquer(uid, id, 'RECETTE-PCT');
    if (!r.valide) throw new Error(`refuse : ${r.motif}`);
    if (Number(r.remise) !== 50) throw new Error(`remise ${r.remise} au lieu de 50`);
    return "remise plafonnee a 50";
  });

  await etape("un code expire est refuse, et le dit", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    await c.query(
      `insert into public.promo_codes (code, libelle, type, valeur, debut, fin)
       values ('RECETTE-EXPIRE', 'Expire', 'fixed', 200, now() - interval '10 days',
               now() - interval '1 day')`
    );
    const r = await appliquer(uid, id, 'RECETTE-EXPIRE');
    if (r.valide) throw new Error("un code expire a ete accepte");
    if (!sansAccent(r.motif).includes("expire")) throw new Error(`motif : ${r.motif}`);
    return r.motif;
  });

  await etape("un code reserve a une autre ville est refuse", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid, "Abidjan");
    await publier({ code: "RECETTE-KORHOGO", type: "fixed", valeur: 200, ville: "korhogo" });
    const r = await appliquer(uid, id, 'RECETTE-KORHOGO');
    if (r.valide) throw new Error("accepte hors de sa ville");
    if (!sansAccent(r.motif).includes("ville")) throw new Error(`motif : ${r.motif}`);
    return r.motif;
  });

  await etape("un code valable dans la ville de la course est accepte", async () => {
    // La course enregistre « Abidjan », le referentiel « abidjan » : sans la
    // correspondance des deux, la restriction par ville refuserait tout.
    const uid = await creerCompte();
    const id = await creerCourse(uid, "Abidjan");
    await publier({ code: "RECETTE-ABJ", type: "fixed", valeur: 200, ville: "abidjan" });
    const r = await appliquer(uid, id, 'RECETTE-ABJ');
    if (!r.valide) throw new Error(`refuse dans sa propre ville : ${r.motif}`);
    return "accepte";
  });

  await etape("une personne ne consomme pas deux fois un code limite a un usage", async () => {
    const uid = await creerCompte();
    await publier({ code: "RECETTE-UNIQUE", type: "fixed", valeur: 200, par_personne: 1 });
    const premiere = await creerCourse(uid);
    const r1 = await appliquer(uid, premiere, 'RECETTE-UNIQUE');
    if (!r1.valide) throw new Error(`la premiere est refusee : ${r1.motif}`);

    const seconde = await creerCourse(uid);
    const r2 = await appliquer(uid, seconde, 'RECETTE-UNIQUE');
    if (r2.valide) throw new Error("le meme client l'a utilise deux fois");
    if (!sansAccent(r2.motif).includes("deja utilise")) throw new Error(`motif : ${r2.motif}`);
    return r2.motif;
  });

  await etape("le plafond global d'utilisations est respecte", async () => {
    await publier({ code: "RECETTE-STOCK", type: "fixed", valeur: 200, usages_max: 1, par_personne: 5 });
    const a = await creerCompte();
    const b = await creerCompte();
    const c1 = await creerCourse(a);
    const c2 = await creerCourse(b);
    const r1 = await appliquer(a, c1, 'RECETTE-STOCK');
    if (!r1.valide) throw new Error(`la premiere est refusee : ${r1.motif}`);
    const r2 = await appliquer(b, c2, 'RECETTE-STOCK');
    if (r2.valide) throw new Error("le stock n'a pas ete respecte");
    return r2.motif;
  });

  await etape("chaque usage est inscrit, avec son montant", async () => {
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    await publier({ code: "RECETTE-TRACE", type: "fixed", valeur: 150 });
    await appliquer(uid, id, 'RECETTE-TRACE');
    const t = (
      await c.query(
        `select code, remise, user_id from public.promo_redemptions where errand_id = $1`,
        [id]
      )
    ).rows[0];
    if (!t) throw new Error("aucun usage inscrit : la promotion est incomptable");
    if (Number(t.remise) !== 150) throw new Error(`remise inscrite ${t.remise}`);
    if (t.user_id !== uid) throw new Error("l'usage n'est pas rattache au client");
    return `${t.code} pour ${t.remise}`;
  });

  await etape("la garde refuse une remise qui mordrait sur le gain du shopper", async () => {
    // La garde est la derniere barriere : elle doit refuser meme une ecriture
    // qui contourne le moteur.
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    await c.query(`select set_config('app.errand_engine', 'on', true)`);
    let msg = "";
    try {
      await c.query(
        `update public.errands
            set promo_discount = 500, commission_amount = commission_amount - 500
          where id = $1`,
        [id]
      );
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("une commission negative est passee");
    if (!sansAccent(msg).includes("negative") && !sansAccent(msg).includes("gain du shopper")) {
      throw new Error(`refus inattendu : ${msg}`);
    }
    return msg.slice(0, 60);
  });

  await etape("appliquer deux fois le meme code ne retranche pas deux fois", async () => {
    // Le defaut existait : la fonction soustrayait, puis le declencheur
    // soustrayait encore. Tout se recalcule desormais depuis les montants
    // bruts, ce qui rend l'operation idempotente.
    const uid = await creerCompte();
    const id = await creerCourse(uid);
    await publier({ code: "RECETTE-DEUXFOIS", type: "fixed", valeur: 200, par_personne: 5 });

    await appliquer(uid, id, 'RECETTE-DEUXFOIS');
    const une = await course(id);
    await appliquer(uid, id, 'RECETTE-DEUXFOIS');
    const deux = await course(id);

    for (const champ of ["commission_amount", "runner_payout", "total_amount", "promo_discount"]) {
      if (Number(une[champ]) !== Number(deux[champ])) {
        throw new Error(`${champ} : ${une[champ]} puis ${deux[champ]}`);
      }
    }
    return `remise stable a ${deux.promo_discount}`;
  });

  await etape("l'acceptation d'une offre ne fait pas mordre la remise sur le gain", async () => {
    // Le shopper propose son prix et le serveur recalcule frais et commission.
    // Sans reprise, la remise resterait celle du devis initial, et pourrait
    // depasser la nouvelle commission.
    const client = await creerCompte();
    const id = await creerCourse(client);
    await publier({ code: "RECETTE-OFFRE", type: "fixed", valeur: 99999 });
    await appliquer(client, id, 'RECETTE-OFFRE');

    const shopper = await creerCompte();
    await c.query(
      `insert into public.runner_profiles (user_id, full_name, phone, city, vehicle, status,
         date_of_birth, id_document_type, id_doc_url, selfie_url)
       values ($1, 'Shopper Recette', '0700000000', 'Abidjan', 'moto', 'approved',
         '1990-01-01', 'cni', 'u/p.jpg', 'u/s.jpg')`,
      [shopper]
    );
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: shopper, role: "authenticated" }),
    ]);
    const offre = (
      await c.query(
        `insert into public.errand_offers (errand_id, runner_id, price, message)
         values ($1, $2, 4000, 'Je peux le faire') returning id`,
        [id, shopper]
      )
    ).rows[0].id;

    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: client, role: "authenticated" }),
    ]);
    await c.query(`select public.errand_accept_offer($1)`, [offre]);
    await c.query(`select set_config('request.jwt.claims', null, true)`);

    const apres = await course(id);
    const brute = Math.round(Number(apres.service_fee) * 0.15 * 100) / 100;
    // Le gain du shopper doit valoir les frais moins la commission BRUTE :
    // la remise ne doit rien lui prendre.
    const attendu = Math.round((Number(apres.service_fee) - brute) * 100) / 100;
    if (Math.abs(Number(apres.runner_payout) - attendu) > 0.01) {
      throw new Error(`gain ${apres.runner_payout} au lieu de ${attendu}`);
    }
    if (Number(apres.commission_amount) < 0) {
      throw new Error(`commission negative : ${apres.commission_amount}`);
    }
    return `frais ${apres.service_fee}, remise ${apres.promo_discount}, gain ${apres.runner_payout}`;
  });

  await etape("un tiers ne peut pas poser un code sur la course d'un autre", async () => {
    const client = await creerCompte();
    const intrus = await creerCompte();
    const id = await creerCourse(client);
    await publier({ code: "RECETTE-INTRUS", type: "fixed", valeur: 200 });

    let msg = "";
    try {
      await appliquer(intrus, id, "RECETTE-INTRUS");
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("un tiers a pose un code sur la course d'un autre");
    if (!sansAccent(msg).includes("seul le client")) throw new Error(`refus inattendu : ${msg}`);
    return "refuse";
  });

  await etape("publier un code demande le droit correspondant", async () => {
    const uid = await creerCompte();
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    let msg = "";
    try {
      await c.query(`select public.promo_publier('RECETTE-VOL', 'Tentative', 'fixed', 500)`);
    } catch (e) {
      msg = e.message;
    }
    await c.query("rollback to savepoint etape");
    if (!msg) throw new Error("un compte ordinaire a publie un code");
    if (!sansAccent(msg).includes("droit")) throw new Error(`refus inattendu : ${msg}`);
    return "refuse";
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
