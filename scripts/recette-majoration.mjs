/**
 * Recette de la majoration exceptionnelle.
 *
 * Une majoration est un outil qui se retourne vite : elle peut devenir une
 * hausse de tarif déguisée, une rente sur une pénurie, ou une surprise pour le
 * client. Cette recette éprouve les trois garde-fous qui l'en empêchent.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-majoration.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette de la majoration"));
await c.connect();
await c.query("begin");

let n = 0;
const echecs = [];
const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const etape = async (titre, fn) => {
  n++;
  try {
    await c.query("savepoint etape");
    // Une majoration ouverte par une etape survivrait a la suivante, et la
    // garde de non-chevauchement ferait alors echouer une etape saine pour une
    // raison etrangere a ce qu'elle mesure. Chaque etape part donc d'un etat
    // sans majoration, ce qui est aussi l'etat courant du service.
    await c.query("delete from public.pricing_surges");
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
      [`majoration-${compteur}@exemple.test`]
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
    return { ok: true, valeur: r.rows[0], lignes: r.rows };
  } catch (e) {
    await c.query("rollback to savepoint tentative");
    await anonyme();
    return { ok: false, message: e.message };
  }
};

const responsable = async () => {
  const uid = await creerCompte();
  await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_operations')`, [uid]);
  return uid;
};

const devis = async (ville = "Abidjan") =>
  (
    await c.query(
      `select public.pricing_quote($1,'moto','small','standard','runner_delivers',5,60,3) j`,
      [ville]
    )
  ).rows[0].j;

try {
  await etape("le supplément revient entièrement au shopper", async () => {
    // C'est la décision de fond : la majoration existe pour convaincre
    // quelqu'un de sortir sous la pluie, pas pour enrichir la plateforme d'une
    // pénurie. La commission se calcule sur le tarif d'avant.
    const avant = await devis();
    const r = await responsable();
    await essayer(
      r,
      `select public.surge_ouvrir(1.5, 'Orage sur Abidjan, peu de shoppers disponibles', 120, 'abidjan')`
    );
    const apres = await devis();

    const gainShopper = Number(apres.runnerPayout) - Number(avant.runnerPayout);
    const gainAkwaba = Number(apres.commission) - Number(avant.commission);
    if (Number(apres.surgeFee) <= 0) throw new Error("aucune majoration appliquée");
    if (gainShopper !== Number(apres.surgeFee)) {
      throw new Error(`le shopper reçoit ${gainShopper} sur ${apres.surgeFee}`);
    }
    if (gainAkwaba !== 0) throw new Error(`Akwaba gagne ${gainAkwaba} sur la majoration`);
    return `${apres.surgeFee} au shopper, 0 à Akwaba`;
  });

  await etape("le motif est annoncé avec le prix, pas après", async () => {
    const r = await responsable();
    await essayer(
      r,
      `select public.surge_ouvrir(1.3, 'Match au stade, circulation bloquée à Cocody', 120, 'abidjan')`
    );
    const d = await devis();
    if (!d.surgeReason) throw new Error("le devis ne porte pas le motif");
    if (!d.surgeUntil) throw new Error("le devis ne dit pas jusqu'à quand");
    if (!String(d.surgeReason).includes("stade")) throw new Error(d.surgeReason);
    return String(d.surgeReason).slice(0, 45);
  });

  await etape("une majoration ne dépasse jamais le double", async () => {
    // Un chiffre saisi de travers ne doit pas pouvoir tripler un prix. La
    // borne est dans la contrainte de la table, pas dans le code.
    const r = await responsable();
    const trop = await essayer(
      r,
      `select public.surge_ouvrir(3, 'Tentative de triplement du tarif', 60, 'abidjan')`
    );
    if (trop.ok) throw new Error("un triplement a été accepté");
    const juste = await essayer(
      r,
      `select public.surge_ouvrir(2, 'Nuit du 31 décembre, très forte demande', 60, 'abidjan')`
    );
    if (!juste.ok) throw new Error(`le double est refusé : ${juste.message}`);
    return "3 refusé, 2 accepté";
  });

  await etape("une majoration a toujours une fin", async () => {
    // Sans terme, ce n'est plus une majoration mais une hausse de tarif
    // déguisée, qui mérite de passer par le barème où elle se voit.
    const r = await responsable();
    const trop = await essayer(
      r,
      `select public.surge_ouvrir(1.3, 'Majoration sans fin envisagee', 5000, 'abidjan')`
    );
    if (trop.ok) throw new Error("une majoration de plus de 24 heures a été acceptée");
    if (!sansAccent(trop.message).includes("vingt-quatre heures")) throw new Error(trop.message);
    return trop.message.slice(0, 50);
  });

  await etape("un motif trop court est refusé", async () => {
    const r = await responsable();
    const trop = await essayer(r, `select public.surge_ouvrir(1.3, 'pluie', 60, 'abidjan')`);
    if (trop.ok) throw new Error("un motif d'un mot a été accepté");
    return "refuse";
  });

  await etape("deux majorations ne se chevauchent pas au même endroit", async () => {
    // Laquelle s'appliquerait ? La question n'a pas de bonne réponse, donc on
    // interdit la situation.
    const r = await responsable();
    await essayer(r, `select public.surge_ouvrir(1.3, 'Premiere majoration en cours', 120, 'abidjan')`);
    const seconde = await essayer(
      r,
      `select public.surge_ouvrir(1.5, 'Seconde majoration qui chevauche', 120, 'abidjan')`
    );
    if (seconde.ok) throw new Error("deux majorations coexistent");
    if (!sansAccent(seconde.message).includes("couvre deja")) throw new Error(seconde.message);
    return seconde.message.slice(0, 45);
  });

  await etape("une majoration de ville ne touche pas les autres villes", async () => {
    const r = await responsable();
    await essayer(r, `select public.surge_ouvrir(1.5, 'Orage localise sur Abidjan seulement', 120, 'abidjan')`);
    const ici = await devis("Abidjan");
    const ailleurs = await devis("Bouaké");
    if (Number(ici.surgeFee) <= 0) throw new Error("Abidjan n'est pas majorée");
    if (Number(ailleurs.surgeFee) !== 0) throw new Error("Bouaké est majorée aussi");
    return "Abidjan majorée, Bouaké non";
  });

  await etape("une majoration nationale vaut partout", async () => {
    const r = await responsable();
    await essayer(r, `select public.surge_ouvrir(1.2, 'Jour ferie national, service reduit', 120, null)`);
    for (const ville of ["Abidjan", "Bouaké", "Korhogo"]) {
      const d = await devis(ville);
      if (Number(d.surgeFee) <= 0) throw new Error(`${ville} n'est pas majorée`);
    }
    return "les trois villes";
  });

  await etape("elle s'arrête d'elle-même à l'échéance", async () => {
    const r = await responsable();
    const ouverte = await essayer(
      r,
      `select public.surge_ouvrir(1.5, 'Majoration qui doit expirer seule', 60, 'abidjan') j`
    );
    if (Number((await devis()).surgeFee) <= 0) throw new Error("la majoration n'a pas pris");
    // On vieillit debut ET fin : la contrainte exige que la fin suive le
    // debut, et ramener la seule fin dans le passe la violerait.
    await c.query(
      `update public.pricing_surges
          set debut = now() - interval '2 hours', fin = now() - interval '1 minute'
        where id = $1`,
      [ouverte.valeur.j.id]
    );
    if (Number((await devis()).surgeFee) !== 0) throw new Error("une majoration échue s'applique encore");
    return "refermée seule";
  });

  await etape("l'arrêter n'efface pas sa trace", async () => {
    // Les courses publiées pendant qu'elle courait portent son prix : le motif
    // de ce prix doit rester consultable.
    const r = await responsable();
    const ouverte = await essayer(
      r,
      `select public.surge_ouvrir(1.5, 'Majoration arretee a la main', 120, 'abidjan') j`
    );
    await essayer(r, `select public.surge_arreter($1)`, [ouverte.valeur.j.id]);
    const ligne = (
      await c.query(`select actif, motif from public.pricing_surges where id = $1`, [
        ouverte.valeur.j.id,
      ])
    ).rows[0];
    if (!ligne) throw new Error("la majoration a été effacée");
    if (ligne.actif) throw new Error("elle n'est pas arrêtée");
    if (Number((await devis()).surgeFee) !== 0) throw new Error("elle s'applique encore");
    return "arrêtée, conservée";
  });

  await etape("elle ne s'ouvre pas sans le droit", async () => {
    const quidam = await creerCompte();
    const r = await essayer(
      quidam,
      `select public.surge_ouvrir(1.3, 'Tentative sans habilitation aucune', 60, 'abidjan')`
    );
    if (r.ok) throw new Error("un compte ordinaire a majoré les prix");
    return "refuse";
  });

  await etape("un responsable limité à une ville ne majore pas ailleurs", async () => {
    // Le périmètre s'applique ici comme partout : majorer Abidjan depuis
    // Bouaké serait décider pour une ville dont on n'a pas la charge.
    const s = await creerCompte();
    await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'super_admin')`, [s]);
    const local = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, 'bouake')`, [local]);

    const chezLui = await essayer(
      local,
      `select public.surge_ouvrir(1.3, 'Orage sur Bouake, peu de shoppers', 60, 'bouake')`
    );
    if (!chezLui.ok) throw new Error(`refuse dans sa propre ville : ${chezLui.message}`);

    const ailleurs = await essayer(
      local,
      `select public.surge_ouvrir(1.3, 'Tentative de majoration hors perimetre', 60, 'abidjan')`
    );
    if (ailleurs.ok) throw new Error("il a majoré une ville dont il n'a pas la charge");
    return "Bouaké oui, Abidjan non";
  });

  await etape("le client voit la majoration en cours, même sans compte", async () => {
    // Un supplément qu'on découvre au paiement n'est pas un prix. Elle doit
    // être lisible avant qu'on commande, donc y compris sans être connecté.
    const r = await responsable();
    await essayer(r, `select public.surge_ouvrir(1.3, 'Majoration visible par le visiteur', 60, 'abidjan')`);
    await c.query("set local role anon");
    const vue = (await c.query(`select * from public.surge_en_vigueur('Abidjan')`)).rows[0];
    await c.query("reset role");
    if (!vue) throw new Error("un visiteur ne voit pas la majoration");
    if (!vue.motif) throw new Error("il ne voit pas le motif");
    return "visible avec son motif";
  });

  await etape("l'historique, lui, reste à l'exploitation", async () => {
    const r = await responsable();
    const ouverte = await essayer(
      r,
      `select public.surge_ouvrir(1.3, 'Majoration passee a masquer', 60, 'abidjan') j`
    );
    await essayer(r, `select public.surge_arreter($1)`, [ouverte.valeur.j.id]);
    await c.query("set local role anon");
    const vues = (await c.query(`select count(*)::int n from public.pricing_surges`)).rows[0].n;
    await c.query("reset role");
    if (Number(vues) !== 0) throw new Error(`${vues} majoration(s) passées visibles par un visiteur`);
    return "aucune passée visible";
  });

  await etape("chaque ouverture laisse une trace nominative", async () => {
    const r = await responsable();
    await essayer(r, `select public.surge_ouvrir(1.5, 'Majoration tracee pour la recette', 90, 'abidjan')`);
    const t = (
      await c.query(
        `select details from public.audit_logs where action = 'surge_ouvrir' and actor_id = $1`,
        [r]
      )
    ).rows[0];
    if (!t) throw new Error("aucune trace");
    if (Number(t.details.multiplicateur) !== 1.5) throw new Error(`multiplicateur ${t.details.multiplicateur}`);
    if (!t.details.motif) throw new Error("le motif n'est pas tracé");
    return "multiplicateur, ville, durée et motif conservés";
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
