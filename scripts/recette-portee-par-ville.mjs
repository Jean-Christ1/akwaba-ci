/**
 * Recette de la portée par ville.
 *
 * Le catalogue déclare treize droits « restreignables à une ou plusieurs
 * villes », et le tiroir de la console le répète à qui les accorde. Onze ne
 * restreignaient rien : le contrôle appelait has_permission, qui répond oui
 * sans regarder où.
 *
 * Un responsable recruté pour ouvrir Bouaké tranchait donc les litiges
 * d'Abidjan, validait les shoppers de Yamoussoukro, corrigeait n'importe quelle
 * course et modérait toutes les fiches du pays.
 *
 * Chaque étape monte la même scène : une personne restreinte à une ville, un
 * objet dans sa ville, un objet dans une autre. Elle doit passer sur le premier
 * et être refusée sur le second. Vérifier seulement le refus ne prouverait
 * rien, une garde qui bloque tout se retirant au premier incident.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-portee-par-ville.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette de la portée"));
await c.connect();
await c.query("begin");

/** La ville où le personnel de recette est affecté, et celle qu'il ne voit pas. */
const SIENNE = "Abidjan";
const AUTRE = "Bouaké";

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
      [`portee-${compteur}@exemple.test`]
    )
  ).rows[0].id;
};

/** Quelqu'un du personnel, restreint à une seule ville. */
const restreintA = async (role, ville) => {
  const uid = await creerCompte();
  await c.query(
    `insert into public.staff_assignments (user_id, role_code, scope_type, scope_value, motif)
     values ($1, $2, 'ville', $3, 'Recette de la portee')`,
    [uid, role, ville]
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

const course = async (ville, statut = "open") => {
  const client = await creerCompte();
  return (
    await c.query(
      `insert into public.errands (customer_id, title, category, city, delivery_address, items, status)
       values ($1, 'Course de recette', 'grocery', $2, 'Adresse de recette', '[]'::jsonb, $3::errand_status)
       returning id`,
      [client, ville, statut]
    )
  ).rows[0].id;
};

const lieu = async (ville) => {
  compteur++;
  return (
    await c.query(
      `insert into public.places (slug, name, type, city, address, description, lat, lng, status, owner_id)
       values ($1, 'Lieu de recette', 'restaurant', $2, 'Adresse', 'Fiche de recette',
               5.35, -4.02, 'draft'::place_status, $3)
       returning id`,
      [`portee-lieu-${compteur}`, ville, await creerCompte()]
    )
  ).rows[0].id;
};

const shopper = async (ville) => {
  const uid = await creerCompte();
  return {
    uid,
    id: (
      await c.query(
        `insert into public.runner_profiles (user_id, full_name, phone, city, status)
         values ($1, 'Shopper de recette', '0700112233', $2, 'pending'::runner_status)
         returning id`,
        [uid, ville]
      )
    ).rows[0].id,
  };
};

/**
 * Les deux moitiés d'une même preuve : passer chez soi, être refusé ailleurs.
 * Le refus seul ne prouve rien, le passage seul non plus.
 */
const iciEtPasAilleurs = async (qui, faire) => {
  // Une politique qui filtre ne leve pas : elle rend zero ligne. Se fier au
  // seul « ok » faisait passer l'etape ecartee pour un succes.
  const abouti = (r) => r.ok && (r.nombre === undefined || r.nombre > 0);

  const ici = await faire(SIENNE);
  if (!abouti(ici)) throw new Error("refusé dans sa propre ville : " + (ici.message ?? "aucune ligne touchée"));
  const ailleurs = await faire(AUTRE);
  if (abouti(ailleurs)) throw new Error("PASSE DANS UNE VILLE QUI N'EST PAS LA SIENNE");
  return "passe chez lui, refusé ailleurs";
};

try {
  // Une course ne se cree que dans une ville desservie. On ouvre la seconde
  // ville le temps de la transaction, ce que la console fera le jour ou elle
  // ouvrira : la recette ne doit pas dependre de l'etat commercial du moment.
  await c.query(`update public.service_cities set errands_enabled = true where slug = 'bouake'`);

  await etape("LITIGES : trancher ne vaut que dans sa ville", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    return iciEtPasAilleurs(moderateur, async (ville) => {
      const id = await course(ville, "disputed");
      return appeler(
        moderateur,
        `select public.errand_resolve_dispute($1, 'client', 'Arbitrage de recette')`,
        [id]
      );
    });
  });

  await etape("le résumé de financement d'un litige, pareil", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    const dansSaVille = await appeler(
      moderateur,
      `select public.errand_financement_resume($1) as r`,
      [await course(SIENNE)]
    );
    if (!dansSaVille.ok) throw new Error(dansSaVille.message);
    if (!dansSaVille.lignes[0].r) throw new Error("rien rendu dans sa propre ville");

    const ailleurs = await appeler(
      moderateur,
      `select public.errand_financement_resume($1) as r`,
      [await course(AUTRE)]
    );
    // La fonction rend un agregat : hors perimetre, elle ne doit rien porter.
    if (ailleurs.ok && ailleurs.lignes[0].r) throw new Error("LE FINANCEMENT D'UNE AUTRE VILLE EST LISIBLE");
    return "résumé chez lui, vide ailleurs";
  });

  await etape("COURSES : rouvrir une remise verrouillée ne vaut que dans sa ville", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    return iciEtPasAilleurs(moderateur, async (ville) => {
      const id = await course(ville, "assigned");
      // Le verrou se pose par le moteur, comme dans le parcours reel : une
      // ecriture directe heurterait la garde des colonnes privilegiees.
      await c.query(`select set_config('app.errand_engine', 'on', true)`);
      await c.query(
        `update public.errands set handover_attempts = 3, handover_locked_at = now() where id = $1`,
        [id]
      );
      await c.query(`select set_config('app.errand_engine', 'off', true)`);
      return appeler(moderateur, `select public.errand_unlock_handover($1, 'Recette')`, [id]);
    });
  });

  await etape("corriger une course ne vaut que dans sa ville", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    return iciEtPasAilleurs(moderateur, async (ville) => {
      const id = await course(ville, "open");
      return appeler(
        moderateur,
        `update public.errands set title = 'Titre corrige par le support' where id = $1`,
        [id]
      );
    });
  });

  await etape("voir les courses ne vaut que dans sa ville", async () => {
    // Celle-la restreignait deja. Elle reste dans la recette parce qu'elle est
    // le modele des autres, et qu'une regression y passerait inapercue.
    const moderateur = await restreintA("moderateur", SIENNE);
    const sienne = await course(SIENNE);
    const autre = await course(AUTRE);
    const r = await appeler(moderateur, `select id from public.errands where id = any($1::uuid[])`, [
      [sienne, autre],
    ]);
    const vues = r.lignes.map((l) => l.id);
    if (!vues.includes(sienne)) throw new Error("sa propre ville lui est invisible");
    if (vues.includes(autre)) throw new Error("UNE COURSE D'UNE AUTRE VILLE EST VISIBLE");
    return "une course vue, une course cachée";
  });

  await etape("LIEUX : un brouillon d'une autre ville reste invisible", async () => {
    const contenu = await restreintA("admin_contenu", SIENNE);
    const sienne = await lieu(SIENNE);
    const autre = await lieu(AUTRE);
    const r = await appeler(contenu, `select id from public.places where id = any($1::uuid[])`, [
      [sienne, autre],
    ]);
    const vues = r.lignes.map((l) => l.id);
    if (!vues.includes(sienne)) throw new Error("sa propre ville lui est invisible");
    if (vues.includes(autre)) throw new Error("UN BROUILLON D'UNE AUTRE VILLE EST VISIBLE");
    return "un brouillon vu, un brouillon caché";
  });

  await etape("publier une fiche ne vaut que dans sa ville", async () => {
    const contenu = await restreintA("admin_contenu", SIENNE);
    return iciEtPasAilleurs(contenu, async (ville) =>
      appeler(
        contenu,
        `update public.places set status = 'published'::place_status where id = $1`,
        [await lieu(ville)]
      )
    );
  });

  await etape("DEMANDES : une demande suit la ville de son établissement", async () => {
    const contenu = await restreintA("admin_contenu", SIENNE);
    const demande = async (ville) =>
      (
        await c.query(
          `insert into public.leads (place_id, kind, full_name, email, message, status)
           values ($1, 'restaurant'::lead_kind, 'Visiteur de recette', 'visiteur@exemple.test',
                   'Une demande de recette', 'new')
           returning id`,
          [await lieu(ville)]
        )
      ).rows[0].id;

    const sienne = await demande(SIENNE);
    const autre = await demande(AUTRE);
    const r = await appeler(contenu, `select id from public.leads where id = any($1::uuid[])`, [
      [sienne, autre],
    ]);
    const vues = r.lignes.map((l) => l.id);
    if (!vues.includes(sienne)) throw new Error("sa propre ville lui est invisible");
    if (vues.includes(autre)) throw new Error("UNE DEMANDE D'UNE AUTRE VILLE EST VISIBLE");
    return "une demande vue, une demande cachée";
  });

  await etape("une demande sans établissement revient à qui n'est pas restreint", async () => {
    // Elle n'appartient a aucune ville. La donner a personne serait pire que
    // de la faire remonter au national.
    const contenu = await restreintA("admin_contenu", SIENNE);
    const national = await creerCompte();
    await c.query(
      `insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_contenu')`,
      [national]
    );
    const sansLieu = (
      await c.query(
        `insert into public.leads (kind, full_name, email, message, status)
         values ('generic'::lead_kind, 'Visiteur de recette', 'sanslieu@exemple.test',
                 'Une demande generale', 'new')
         returning id`
      )
    ).rows[0].id;

    const restreint = await appeler(contenu, `select id from public.leads where id = $1`, [sansLieu]);
    if (restreint.nombre !== 0) throw new Error("un restreint voit une demande sans ville");

    const libre = await appeler(national, `select id from public.leads where id = $1`, [sansLieu]);
    if (libre.nombre !== 1) throw new Error("personne ne voit la demande générale");
    return "invisible au restreint, visible au national";
  });

  await etape("SHOPPERS : un dossier d'une autre ville reste invisible", async () => {
    const support = await restreintA("admin_support", SIENNE);
    const sien = await shopper(SIENNE);
    const autre = await shopper(AUTRE);
    const r = await appeler(support, `select id from public.runner_profiles where id = any($1::uuid[])`, [
      [sien.id, autre.id],
    ]);
    const vues = r.lignes.map((l) => l.id);
    if (!vues.includes(sien.id)) throw new Error("sa propre ville lui est invisible");
    if (vues.includes(autre.id)) throw new Error("UN DOSSIER D'UNE AUTRE VILLE EST VISIBLE");
    return "un dossier vu, un dossier caché";
  });

  await etape("valider un shopper ne vaut que dans sa ville", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    return iciEtPasAilleurs(moderateur, async (ville) => {
      const s = await shopper(ville);
      // Un dossier complet, sinon le refus viendrait des pieces manquantes et
      // non de la portee : la recette prouverait alors autre chose.
      await c.query(
        `update public.runner_profiles set id_doc_url = 'identity-docs/recette.jpg',
                selfie_url = 'identity-docs/recette-selfie.jpg', zones = '["Cocody"]'::jsonb,
                date_of_birth = '1995-04-12', id_document_type = 'cni'
          where id = $1`,
        [s.id]
      );
      return appeler(
        moderateur,
        `select public.runner_set_status($1, 'approved'::runner_status, 'Recette')`,
        [s.id]
      );
    });
  });

  await etape("rouvrir un dossier d'identité ne vaut que dans sa ville", async () => {
    const moderateur = await restreintA("moderateur", SIENNE);
    return iciEtPasAilleurs(moderateur, async (ville) => {
      const s = await shopper(ville);
      await c.query(`update public.runner_profiles set status = 'approved' where id = $1`, [s.id]);
      return appeler(moderateur, `select public.runner_identity_reopen($1, 'Recette')`, [s.uid]);
    });
  });

  await etape("COMPTOIR : un marchand d'une autre ville reste invisible", async () => {
    const exploitant = await restreintA("admin_operations", SIENNE);
    const marchand = async (ville) =>
      (
        await c.query(
          `insert into public.merchant_accounts (user_id, nom, moyen, numero, ville, actif)
           values ($1, 'Marchand de recette', 'wave'::momo_provider, $2, $3, true)
           returning id`,
          [await creerCompte(), `07${String(1000000 + compteur).slice(0, 8)}`, ville]
        )
      ).rows[0].id;

    const sien = await marchand(SIENNE);
    const autre = await marchand(AUTRE);
    const r = await appeler(
      exploitant,
      `select id from public.merchant_accounts where id = any($1::uuid[])`,
      [[sien, autre]]
    );
    const vues = r.lignes.map((l) => l.id);
    if (!vues.includes(sien)) throw new Error("sa propre ville lui est invisible");
    if (vues.includes(autre)) throw new Error("UN MARCHAND D'UNE AUTRE VILLE EST VISIBLE");
    return "un marchand vu, un marchand caché";
  });

  await etape("la mesure elle-même ne trouve plus rien", async () => {
    const restants = (
      await c.query(`select code from public.portees_qui_ne_restreignent_pas() order by code`)
    ).rows.map((l) => l.code);
    if (restants.length) throw new Error("portées décoratives : " + restants.join(", "));
    return "treize portées, treize restrictions";
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
