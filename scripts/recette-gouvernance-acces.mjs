/**
 * Recette de la gouvernance des accès.
 *
 * La matrice des droits promet une séparation nette : le responsable financier
 * n'a pas accès aux pièces d'identité, l'administrateur plateforme non plus.
 * Une promesse qu'aucun contrôle ne tient est une intention.
 *
 * Cette recette essaie de la briser par le chemin qui marchait avant : se
 * servir soi-même. Puis elle vérifie les périmètres, les échéances, la source
 * de chaque droit, et la réconciliation.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-gouvernance-acces.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette de gouvernance"));
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
      [`gouvernance-${compteur}@exemple.test`]
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

const droit = async (uid, code) =>
  (await c.query(`select public.has_permission($1, $2) a`, [uid, code])).rows[0].a;

/** Un super administrateur, seul habilité à tout distribuer. */
const superAdmin = async () => {
  const uid = await creerCompte();
  await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'super_admin')`, [uid]);
  return uid;
};

/** Un délégué : il porte le droit d'attribuer, et rien d'autre de sensible. */
const delegue = async () => {
  const uid = await creerCompte();
  await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'admin_plateforme')`, [uid]);
  await c.query(
    `insert into public.user_permissions (user_id, permission_code, accorde, motif)
     values ($1, 'roles.attribuer', true, 'delegation legitime du droit d attribuer')`,
    [uid]
  );
  return uid;
};

try {
  await etape("L'ESCALADE : un délégué ne s'accorde plus un droit qu'il n'a pas", async () => {
    // Le chemin exact qui fonctionnait avant cette migration : deux appels, et
    // le délégué détenait le journal d'audit que son rôle lui refusait.
    const d = await delegue();
    if (await droit(d, "audit.lire")) throw new Error("le délégué avait déjà ce droit");
    const r = await essayer(
      d,
      `select public.staff_set_permission($1, 'audit.lire', true, 'je me sers moi-meme')`,
      [d]
    );
    if (r.ok && (await droit(d, "audit.lire"))) throw new Error("ESCALADE : il s'est servi lui-même");
    if (!sansAccent(r.message).includes("vos propres droits")) throw new Error(r.message);
    return r.message.slice(0, 55);
  });

  await etape("L'ESCALADE : il ne s'attribue plus le rôle de super administrateur", async () => {
    const d = await delegue();
    const r = await essayer(d, `select public.staff_assign_role($1, 'super_admin', true)`, [d]);
    if (r.ok) throw new Error("ESCALADE TOTALE : il est devenu super administrateur");
    if (!sansAccent(r.message).includes("vos propres roles")) throw new Error(r.message);
    return r.message.slice(0, 55);
  });

  await etape("il ne l'attribue pas non plus à un complice", async () => {
    // Passer par un tiers était le contournement évident de l'interdiction de
    // se servir soi-même : le complice rend ensuite le droit.
    const d = await delegue();
    const complice = await creerCompte();
    const r = await essayer(d, `select public.staff_assign_role($1, 'super_admin', true)`, [complice]);
    if (r.ok) throw new Error("le délégué a fabriqué un super administrateur");
    if (!sansAccent(r.message).includes("plus etendu que le votre")) throw new Error(r.message);
    return r.message.slice(0, 55);
  });

  await etape("il n'accorde pas à autrui un droit qu'il ne détient pas", async () => {
    const d = await delegue();
    const autre = await creerCompte();
    const r = await essayer(
      d,
      `select public.staff_set_permission($1, 'audit.lire', true, 'pour un collegue')`,
      [autre]
    );
    if (r.ok) throw new Error("il a accordé un droit qu'il n'a pas");
    if (!sansAccent(r.message).includes("que vous ne detenez pas")) throw new Error(r.message);
    return r.message.slice(0, 55);
  });

  await etape("mais il accorde bien ce qu'il détient", async () => {
    // Le confinement ne doit pas tout bloquer : déléguer reste possible, dans
    // la limite de ce qu'on a soi-même.
    const d = await delegue();
    const autre = await creerCompte();
    if (!(await droit(d, "courses.lire"))) throw new Error("le délégué n'a pas courses.lire");
    const r = await essayer(
      d,
      `select public.staff_set_permission($1, 'courses.lire', true, 'renfort pour la haute saison')`,
      [autre]
    );
    if (!r.ok) throw new Error(r.message);
    if (!(await droit(autre, "courses.lire"))) throw new Error("le droit n'a pas été accordé");
    return "accordé";
  });

  await etape("le super administrateur, lui, distribue tout", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    const r = await essayer(
      s,
      `select public.staff_assign_role($1, 'admin_conformite', true)`,
      [autre]
    );
    if (!r.ok) throw new Error(r.message);
    if (!(await droit(autre, "audit.lire"))) throw new Error("le rôle n'ouvre rien");
    return "rôle attribué";
  });

  await etape("le dernier super administrateur ne se retire pas", async () => {
    // Sans lui, la console se ferme à tout le monde et rien dans l'application
    // ne permet de la rouvrir.
    const s = await superAdmin();
    const autre = await superAdmin();
    // On en retire un : il en reste un, c'est permis.
    const premier = await essayer(s, `select public.staff_assign_role($1, 'super_admin', false)`, [autre]);
    if (!premier.ok) throw new Error(`retirer le premier a échoué : ${premier.message}`);
    // On tente le dernier de la base.
    await c.query(`delete from public.staff_assignments where role_code = 'super_admin' and user_id <> $1`, [s]);
    const admin = await creerCompte();
    await c.query(`insert into public.staff_assignments (user_id, role_code) values ($1, 'super_admin')`, [admin]);
    await c.query(`delete from public.staff_assignments where role_code = 'super_admin' and user_id <> $1 and user_id <> $2`, [s, admin]);
    const dernier = await essayer(admin, `select public.staff_assign_role($1, 'super_admin', false)`, [s]);
    await c.query(`delete from public.staff_assignments where role_code = 'super_admin' and user_id = $1`, [s]);
    const seul = await essayer(admin, `select public.staff_assign_role($1, 'super_admin', false)`, [admin]);
    if (seul.ok) throw new Error("le dernier super administrateur s'est retiré");
    if (!dernier.ok && !sansAccent(dernier.message).includes("aucun super")) {
      // Retirer l'avant-dernier doit passer ; seul le dernier est protégé.
      throw new Error(`l'avant-dernier n'a pas pu être retiré : ${dernier.message}`);
    }
    return "le dernier est protégé";
  });

  await etape("un périmètre limite le droit à une ville", async () => {
    const s = await superAdmin();
    const local = await creerCompte();
    const r = await essayer(
      s,
      `select public.staff_assign_role($1, 'admin_operations', true, 'bouake', null, 'ouverture de Bouake')`,
      [local]
    );
    if (!r.ok) throw new Error(r.message);

    const aBouake = (
      await c.query(`select public.has_scoped_permission($1, 'courses.lire', 'bouake') a`, [local])
    ).rows[0].a;
    const aAbidjan = (
      await c.query(`select public.has_scoped_permission($1, 'courses.lire', 'abidjan') a`, [local])
    ).rows[0].a;
    if (!aBouake) throw new Error("il n'a pas le droit dans sa propre ville");
    if (aAbidjan) throw new Error("le périmètre ne limite rien : il a Abidjan aussi");
    return "Bouaké oui, Abidjan non";
  });

  await etape("le même rôle peut être confié sur deux villes", async () => {
    // La clé primaire l'interdisait : elle portait sur la personne et le rôle,
    // sans la ville.
    const s = await superAdmin();
    const local = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, 'bouake')`, [local]);
    const seconde = await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, 'korhogo')`, [local]);
    if (!seconde.ok) throw new Error(seconde.message);
    const villes = (
      await c.query(
        `select count(*)::int n from public.staff_assignments where user_id = $1 and role_code = 'admin_operations'`,
        [local]
      )
    ).rows[0].n;
    if (villes !== 2) throw new Error(`${villes} attribution(s)`);
    return "deux villes";
  });

  await etape("sans périmètre, le droit vaut partout", async () => {
    const s = await superAdmin();
    const global = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true)`, [global]);
    for (const ville of ["abidjan", "bouake", "korhogo"]) {
      const a = (
        await c.query(`select public.has_scoped_permission($1, 'courses.lire', $2) a`, [global, ville])
      ).rows[0].a;
      if (!a) throw new Error(`refusé à ${ville}`);
    }
    return "les trois villes";
  });

  await etape("une ville inconnue est refusée à l'attribution", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    const r = await essayer(
      s,
      `select public.staff_assign_role($1, 'admin_operations', true, 'ouagadougou')`,
      [autre]
    );
    if (r.ok) throw new Error("une ville inconnue a été acceptée");
    if (!sansAccent(r.message).includes("ville inconnue")) throw new Error(r.message);
    return r.message.slice(0, 40);
  });

  await etape("une attribution échue ne donne plus rien", async () => {
    const s = await superAdmin();
    const temporaire = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, null, 30, 'remplacement conge')`, [temporaire]);
    if (!(await droit(temporaire, "courses.lire"))) throw new Error("le droit n'a pas été ouvert");
    await c.query(`update public.staff_assignments set expire_le = now() - interval '1 day' where user_id = $1`, [temporaire]);
    if (await droit(temporaire, "courses.lire")) throw new Error("le droit échu ouvre encore");
    return "refermé tout seul";
  });

  await etape("une exception nominative échue ne donne plus rien non plus", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    await essayer(s, `select public.staff_set_permission($1, 'courses.lire', true, 'renfort ponctuel', 7)`, [autre]);
    if (!(await droit(autre, "courses.lire"))) throw new Error("le droit n'a pas été ouvert");
    await c.query(`update public.user_permissions set expire_le = now() - interval '1 hour' where user_id = $1`, [autre]);
    if (await droit(autre, "courses.lire")) throw new Error("l'exception échue ouvre encore");
    return "refermée tout seul";
  });

  await etape("la purge retire ce qui est échu, et le trace", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, null, 1)`, [autre]);
    await c.query(`update public.staff_assignments set expire_le = now() - interval '1 day' where user_id = $1`, [autre]);
    const r = (await c.query(`select public.acces_purger_echus() j`)).rows[0].j;
    if (Number(r.roles_retires) < 1) throw new Error(`aucun rôle retiré : ${JSON.stringify(r)}`);
    const reste = (
      await c.query(`select count(*)::int n from public.staff_assignments where user_id = $1`, [autre])
    ).rows[0].n;
    if (reste !== 0) throw new Error("l'attribution échue est restée");
    return `${r.roles_retires} retirée(s)`;
  });

  await etape("les permissions effectives disent d'où vient chaque droit", async () => {
    // Retirer un droit suppose de savoir par où il arrive. Un droit qui vient
    // de deux sources se retire deux fois.
    const s = await superAdmin();
    const agent = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true)`, [agent]);
    await essayer(s, `select public.staff_set_permission($1, 'audit.lire', true, 'audit ponctuel du trimestre')`, [agent]);
    await essayer(s, `select public.staff_set_permission($1, 'courses.lire', false, 'retire a sa demande')`, [agent]);

    const lignes = (
      await essayer(s, `select * from public.permissions_effectives($1)`, [agent])
    ).lignes;
    const par = Object.fromEntries(lignes.map((l) => [l.code, l]));
    if (par["audit.lire"].source !== "nominatif") throw new Error(`audit.lire : ${par["audit.lire"].source}`);
    if (par["courses.lire"].source !== "retrait") throw new Error(`courses.lire : ${par["courses.lire"].source}`);
    if (par["courses.lire"].accordee) throw new Error("le retrait ne retire pas");
    if (par["litiges.lire"].source !== "role") throw new Error(`litiges.lire : ${par["litiges.lire"].source}`);
    if (!par["litiges.lire"].detail?.includes("exploitation")) {
      throw new Error(`le detail ne nomme pas le role : ${par["litiges.lire"].detail}`);
    }
    return "role, nominatif et retrait distingués";
  });

  await etape("un rôle hérité doublé par la matrice est attribué à la matrice", async () => {
    // Le declencheur recopie le role herite en attribution. La personne detient
    // donc les deux, et c'est la matrice qui explique son droit : c'est par
    // elle qu'on le lui retirerait.
    const s = await superAdmin();
    const double = await creerCompte();
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [double]);
    const lignes = (await essayer(s, `select * from public.permissions_effectives($1)`, [double])).lignes;
    if (!lignes.every((l) => l.accordee)) throw new Error("le rôle hérité n'ouvre pas tout");
    const parRole = lignes.filter((l) => l.source === "role").length;
    if (parRole !== lignes.length) {
      throw new Error(`${lignes.length - parRole} droit(s) attribués au secours alors que la matrice les explique`);
    }
    if (!lignes[0].detail?.includes("Super administrateur")) throw new Error(`detail : ${lignes[0].detail}`);
    return `${parRole} droits, tous par la matrice`;
  });

  await etape("LE CONTOURNEMENT : le rôle hérité seul est nommé « secours »", async () => {
    // Le vrai cas : l'attribution miroir est retiree ensuite, et le role herite
    // continue d'ouvrir les trente-quatre permissions sans qu'aucune ligne de
    // la matrice ne l'explique. Le taire laisserait croire que la matrice fait
    // foi.
    const s = await superAdmin();
    const secours = await creerCompte();
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [secours]);
    await c.query(`delete from public.staff_assignments where user_id = $1`, [secours]);

    const lignes = (await essayer(s, `select * from public.permissions_effectives($1)`, [secours])).lignes;
    if (!lignes.every((l) => l.accordee)) throw new Error("le rôle hérité n'ouvre plus tout");
    if (!lignes.every((l) => l.source === "secours")) {
      throw new Error("la source n'est pas nommée « secours »");
    }
    if (!lignes[0].detail?.includes("hérité")) throw new Error(`detail : ${lignes[0].detail}`);
    return `${lignes.length} droits, aucun expliqué par la matrice`;
  });

  await etape("changer un rôle hérité recopie aussi dans la matrice", async () => {
    // Le declencheur ne se posait qu'a l'insertion : passer quelqu'un de
    // « user » a « admin » lui donnait tout par le secours, invisible.
    // La creation d'un compte pose deja le role « user » par declencheur : on
    // le fait donc evoluer, ce qui est exactement le geste reel d'une promotion.
    const promu = await creerCompte();
    const depart = (
      await c.query(`select role::text from public.user_roles where user_id = $1`, [promu])
    ).rows[0]?.role;
    if (depart !== "user") throw new Error(`role de depart : ${depart}`);
    await c.query(`update public.user_roles set role = 'admin' where user_id = $1`, [promu]);
    const n = (
      await c.query(
        `select count(*)::int n from public.staff_assignments where user_id = $1 and role_code = 'super_admin'`,
        [promu]
      )
    ).rows[0].n;
    if (n !== 1) throw new Error("le changement n'a pas ete recopie dans la matrice");
    return "recopie";
  });

  await etape("chacun peut lire ses propres droits, personne ceux d'un autre", async () => {
    const curieux = await creerCompte();
    const autre = await creerCompte();
    const sien = await essayer(curieux, `select count(*)::int n from public.permissions_effectives($1)`, [curieux]);
    if (!sien.ok) throw new Error(`il ne lit pas ses propres droits : ${sien.message}`);
    const vole = await essayer(curieux, `select count(*)::int n from public.permissions_effectives($1)`, [autre]);
    if (vole.ok) throw new Error("il a lu les droits d'un autre");
    return "les siens seulement";
  });

  await etape("la réconciliation montre les comptes qui contournent la matrice", async () => {
    const s = await superAdmin();
    const secours = await creerCompte();
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [secours]);
    const lignes = (await essayer(s, `select * from public.gouvernance_reconciliation()`, [])).lignes;
    const ligne = lignes.find((l) => l.user_id === secours);
    if (!ligne) throw new Error("le compte de secours n'apparaît pas");
    if (ligne.gravite !== "a_verifier") throw new Error(`gravité ${ligne.gravite}`);
    if (!sansAccent(ligne.ecart).includes("herite")) throw new Error(`ecart : ${ligne.ecart}`);
    return ligne.ecart.slice(0, 50);
  });

  await etape("la réconciliation n'est pas lisible sans le droit", async () => {
    const curieux = await creerCompte();
    const r = await essayer(curieux, `select * from public.gouvernance_reconciliation()`, []);
    if (r.ok) throw new Error("un compte ordinaire a lu la gouvernance");
    return "refuse";
  });

  await etape("un motif reste exigé pour toute exception nominative", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    const r = await essayer(s, `select public.staff_set_permission($1, 'courses.lire', true, 'ok')`, [autre]);
    if (r.ok) throw new Error("une exception sans motif a été acceptée");
    if (!sansAccent(r.message).includes("motif")) throw new Error(r.message);
    return r.message.slice(0, 40);
  });

  await etape("chaque attribution laisse une trace nominative et datée", async () => {
    const s = await superAdmin();
    const autre = await creerCompte();
    await essayer(s, `select public.staff_assign_role($1, 'admin_operations', true, 'bouake', 60, 'ouverture de ville')`, [autre]);
    const t = (
      await c.query(
        `select details from public.audit_logs where action = 'grant_role' and actor_id = $1 and entity_id = $2`,
        [s, autre]
      )
    ).rows[0];
    if (!t) throw new Error("aucune trace");
    if (t.details.ville !== "bouake") throw new Error(`ville : ${t.details.ville}`);
    if (t.details.expire_dans_jours !== 60) throw new Error("l'échéance n'est pas tracée");
    if (!t.details.motif) throw new Error("le motif n'est pas tracé");
    return "ville, échéance et motif conservés";
  });

  await etape("l'ancienne signature sans confinement a bien disparu", async () => {
    // La laisser vivante aurait laissé le trou ouvert : il aurait suffi de
    // l'appeler avec trois arguments.
    const r = await c.query(
      `select count(*)::int n from pg_proc p join pg_namespace nm on nm.oid = p.pronamespace
        where nm.nspname = 'public' and p.proname = 'staff_assign_role'`
    );
    if (r.rows[0].n !== 1) throw new Error(`${r.rows[0].n} versions de staff_assign_role`);
    const s = await c.query(
      `select count(*)::int n from pg_proc p join pg_namespace nm on nm.oid = p.pronamespace
        where nm.nspname = 'public' and p.proname = 'staff_set_permission'`
    );
    if (s.rows[0].n !== 1) throw new Error(`${s.rows[0].n} versions de staff_set_permission`);
    return "une seule version de chacune";
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
