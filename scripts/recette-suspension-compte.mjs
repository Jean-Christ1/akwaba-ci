/**
 * Recette de la suspension d'un compte.
 *
 * Le droit « utilisateurs.suspendre » figurait au catalogue depuis le début et
 * n'ouvrait rien : aucune fonction, aucune politique ne le consultait. La
 * console le disait accordé, et le geste se faisait à la main dans la base,
 * hors de toute trace.
 *
 * Cette recette vérifie le geste qui vient d'être écrit, et surtout ce qu'il
 * refuse : se suspendre soi-même, suspendre plus habilité que soi, lever sa
 * propre suspension d'un simple UPDATE sur son profil.
 *
 * Contre la vraie base, dans une transaction annulée.
 *
 * Usage : node scripts/recette-suspension-compte.mjs
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const c = new pg.Client(exigerConfiguration("recette de la suspension"));
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
      [`suspension-${compteur}@exemple.test`]
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

/** Un appel, sous l'identité et le rôle d'un compte connecté. */
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

const suspendu = async (uid) =>
  (await c.query(`select suspendu_le, suspendu_motif from public.profiles where id = $1`, [uid]))
    .rows[0];

try {
  await etape("le droit ouvre la porte : un admin plateforme suspend un compte", async () => {
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    const r = await appeler(
      gestionnaire,
      `select public.compte_suspendre($1, true, 'Usurpation d''identite signalee par deux shoppers') as x`,
      [cible]
    );
    if (!r.ok) throw new Error(r.message);
    const p = await suspendu(cible);
    if (!p.suspendu_le) throw new Error("le compte n'est pas suspendu");
    if (!p.suspendu_motif) throw new Error("le motif n'est pas conservé");
    return "suspendu, motif conservé";
  });

  await etape("sans le droit, rien ne bouge", async () => {
    // Un shopper ordinaire, puis un moderateur : le second a beau etre du
    // personnel, la matrice ne lui donne pas ce droit-la.
    const cible = await creerCompte();
    for (const [qui, quoi] of [
      [await creerCompte(), "un compte ordinaire"],
      [await avecRole("moderateur"), "un modérateur"],
    ]) {
      const r = await appeler(qui, `select public.compte_suspendre($1, true, 'Motif quelconque')`, [
        cible,
      ]);
      if (r.ok) throw new Error(`${quoi} a pu suspendre`);
      if (!sansAccent(r.message).includes("pas le droit de suspendre")) throw new Error(r.message);
    }
    const p = await suspendu(cible);
    if (p.suspendu_le) throw new Error("le compte a fini suspendu");
    return "deux refus, compte intact";
  });

  await etape("on ne se suspend pas soi-même", async () => {
    // Ce n'est pas un scrupule : se suspendre ferme la console a celui qui le
    // fait, et il n'a plus le moyen de revenir en arriere.
    const gestionnaire = await avecRole("admin_plateforme");
    const r = await appeler(
      gestionnaire,
      `select public.compte_suspendre($1, true, 'Fausse manoeuvre de ma part')`,
      [gestionnaire]
    );
    if (r.ok) throw new Error("le gestionnaire s'est suspendu lui-même");
    if (!sansAccent(r.message).includes("votre propre compte")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("une suspension sans motif est refusée", async () => {
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    for (const motif of [null, "", "   ", "abc"]) {
      const r = await appeler(gestionnaire, `select public.compte_suspendre($1, true, $2)`, [
        cible,
        motif,
      ]);
      if (r.ok) throw new Error(`le motif « ${motif} » est passé`);
    }
    return "quatre motifs vides ou trop courts refusés";
  });

  await etape("on ne suspend pas celui qui attribue les droits", async () => {
    // Meme escalade que retirer son role : suspendre le super administrateur
    // neutraliserait sa hierarchie depuis un cran plus bas.
    const gestionnaire = await avecRole("admin_plateforme");
    const superieur = await avecRole("super_admin");
    const r = await appeler(
      gestionnaire,
      `select public.compte_suspendre($1, true, 'Decision de la direction')`,
      [superieur]
    );
    if (r.ok) throw new Error("LE SUPERIEUR A ETE SUSPENDU PAR PLUS BAS QUE LUI");
    if (!sansAccent(r.message).includes("attribue les droits")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("mais le super administrateur, lui, le peut", async () => {
    // Une garde qui bloque tout ne protege rien : au sommet, la suspension
    // reste possible, sinon un compte compromis ne se ferme jamais.
    const patron = await avecRole("super_admin");
    const autre = await avecRole("super_admin");
    const r = await appeler(
      patron,
      `select public.compte_suspendre($1, true, 'Compte compromis, mot de passe divulgue')`,
      [autre]
    );
    if (!r.ok) throw new Error(r.message);
    if (!(await suspendu(autre)).suspendu_le) throw new Error("rien n'a été suspendu");
    return "suspension au sommet possible";
  });

  await etape("LA PORTE DEROBEE : on ne lève pas sa propre suspension", async () => {
    // La politique « Users can update own profile » laisse chacun ecrire sur
    // sa propre ligne. Si les colonnes de suspension y etaient, une suspension
    // durerait le temps d'un UPDATE.
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Fraude au remboursement')`, [
      cible,
    ]);

    const r = await appeler(
      cible,
      `update public.profiles set suspendu_le = null, suspendu_motif = null where id = $1`,
      [cible]
    );
    if (r.ok && r.nombre > 0) throw new Error("LA SUSPENSION S'EST LEVEE TOUTE SEULE");
    if (!(await suspendu(cible)).suspendu_le) throw new Error("la suspension a disparu");
    return r.ok ? "aucune ligne touchée" : r.message.slice(0, 45);
  });

  await etape("un compte suspendu ne publie plus de course", async () => {
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Adresses de livraison inventees')`, [
      cible,
    ]);
    const r = await appeler(
      cible,
      `insert into public.errands (customer_id, title, category, city, delivery_address, items, status)
       values ($1, 'Course apres suspension', 'grocery', 'Abidjan', 'Cocody', '[]'::jsonb, 'draft')`,
      [cible]
    );
    if (r.ok) throw new Error("LA COURSE A ETE PUBLIEE PAR UN COMPTE SUSPENDU");
    if (!sansAccent(r.message).includes("compte est suspendu")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("il continue de lire ce qui le concerne", async () => {
    // Suspendre n'est pas effacer. Sans lecture, il ne peut ni contester ni
    // recuperer une preuve, et le RGPD ne s'arrete pas a la suspension.
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    const course = (
      await c.query(
        `insert into public.errands (customer_id, title, category, city, delivery_address, items, status)
         values ($1, 'Course avant suspension', 'grocery', 'Abidjan', 'Cocody', '[]'::jsonb, 'draft')
         returning id`,
        [cible]
      )
    ).rows[0].id;
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Contestation en cours')`, [
      cible,
    ]);

    const r = await appeler(cible, `select id from public.errands where id = $1`, [course]);
    if (!r.ok) throw new Error(r.message);
    if (r.nombre !== 1) throw new Error("sa propre course lui est devenue invisible");
    return "sa course reste lisible";
  });

  await etape("la levée efface le motif et rouvre la publication", async () => {
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Verification en cours')`, [
      cible,
    ]);
    const leve = await appeler(gestionnaire, `select public.compte_suspendre($1, false, null)`, [
      cible,
    ]);
    if (!leve.ok) throw new Error(leve.message);
    const p = await suspendu(cible);
    if (p.suspendu_le) throw new Error("la suspension tient encore");
    if (p.suspendu_motif) throw new Error("le motif est resté collé au profil");

    const r = await appeler(
      cible,
      `insert into public.errands (customer_id, title, category, city, delivery_address, items, status)
       values ($1, 'Course apres levee', 'grocery', 'Abidjan', 'Cocody', '[]'::jsonb, 'draft')`,
      [cible]
    );
    if (!r.ok) throw new Error("il ne peut toujours pas publier : " + r.message);
    return "levée effective, publication rouverte";
  });

  await etape("les deux gestes laissent une trace nominative", async () => {
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Motif trace pour audit')`, [
      cible,
    ]);
    await appeler(gestionnaire, `select public.compte_suspendre($1, false, null)`, [cible]);

    const lignes = (
      await c.query(
        `select action, actor_id, details->>'motif' motif from public.audit_logs
          where entity = 'profile' and entity_id = $1 order by created_at`,
        [cible]
      )
    ).rows;
    if (lignes.length !== 2) throw new Error(`${lignes.length} trace(s) au lieu de deux`);
    if (lignes[0].action !== "compte_suspendre" || lignes[1].action !== "compte_reactiver")
      throw new Error("les deux gestes ne sont pas distingués");
    if (lignes.some((l) => l.actor_id !== gestionnaire))
      throw new Error("la trace ne nomme pas son auteur");
    if (!lignes[0].motif) throw new Error("le motif n'est pas dans la trace");
    return "suspension et réactivation tracées, avec leur auteur";
  });

  await etape("L'ANNUAIRE : sans « utilisateurs.lire », il reste fermé", async () => {
    const r = await appeler(await creerCompte(), `select * from public.annuaire_des_comptes(null, 5)`);
    if (r.ok) throw new Error("un compte ordinaire a lu l'annuaire");
    if (!sansAccent(r.message).includes("consulter les comptes")) throw new Error(r.message);
    return r.message.slice(0, 45);
  });

  await etape("il retrouve un compte par son adresse, que la recherche du navigateur ne lit pas", async () => {
    const lecteur = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    const adresse = (await c.query(`select email from auth.users where id = $1`, [cible])).rows[0]
      .email;

    const r = await appeler(lecteur, `select * from public.annuaire_des_comptes($1, 20)`, [adresse]);
    if (!r.ok) throw new Error(r.message);
    const ligne = r.lignes.find((l) => l.user_id === cible);
    if (!ligne) throw new Error("le compte cherché n'est pas revenu");
    if (ligne.courriel !== adresse) throw new Error("l'adresse n'est pas rendue");
    return `retrouvé par « ${adresse} »`;
  });

  await etape("il retrouve aussi par identifiant, par nom et par téléphone", async () => {
    const lecteur = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await c.query(
      `update public.profiles set display_name = 'Konan Yao Recette', phone = '0709887766' where id = $1`,
      [cible]
    );
    for (const critere of [cible, "Konan Yao Recette", "0709887766"]) {
      const r = await appeler(lecteur, `select * from public.annuaire_des_comptes($1, 20)`, [
        critere,
      ]);
      if (!r.ok) throw new Error(r.message);
      if (!r.lignes.some((l) => l.user_id === cible))
        throw new Error(`introuvable par « ${critere} »`);
    }
    return "trois critères, trois fois trouvé";
  });

  await etape("il montre l'état de suspension, son motif et qui l'a posée", async () => {
    // Sans cela, l'ecran afficherait « suspendu » sans dire par qui ni
    // pourquoi, et la levee se deciderait a l'aveugle.
    const gestionnaire = await avecRole("admin_plateforme");
    const cible = await creerCompte();
    await appeler(gestionnaire, `select public.compte_suspendre($1, true, 'Colis reclames jamais recus')`, [
      cible,
    ]);
    const r = await appeler(gestionnaire, `select * from public.annuaire_des_comptes($1, 5)`, [cible]);
    if (!r.ok) throw new Error(r.message);
    const l = r.lignes[0];
    if (!l.suspendu_le) throw new Error("la suspension n'apparaît pas");
    if (!l.suspendu_motif) throw new Error("le motif n'apparaît pas");
    if (!l.suspendu_par_courriel) throw new Error("l'auteur de la suspension n'apparaît pas");
    return "état, motif et auteur rendus";
  });

  await etape("il rend les rôles en cours, et pas ceux qui ont expiré", async () => {
    const lecteur = await avecRole("admin_plateforme");
    const cible = await avecRole("moderateur");
    let r = await appeler(lecteur, `select * from public.annuaire_des_comptes($1, 5)`, [cible]);
    if (!r.lignes[0].roles.includes("moderateur")) throw new Error("le rôle en cours manque");

    await c.query(
      `update public.staff_assignments set expire_le = now() - interval '1 day' where user_id = $1`,
      [cible]
    );
    r = await appeler(lecteur, `select * from public.annuaire_des_comptes($1, 5)`, [cible]);
    if (r.lignes[0].roles.length) throw new Error("un rôle échu est encore affiché comme actif");
    return "rôle en cours affiché, rôle échu retiré";
  });

  await etape("une suspension ne se pose pas non plus à la création du profil", async () => {
    // Le droit d'insertion couvrait toutes les colonnes, celles ajoutees
    // depuis comprises.
    const nouveau = await creerCompte();
    await c.query(`delete from public.profiles where id = $1`, [nouveau]);
    const r = await appeler(
      nouveau,
      `insert into public.profiles (id, display_name, suspendu_le) values ($1, 'Moi', now())`,
      [nouveau]
    );
    if (r.ok) throw new Error("une colonne de suspension a été écrite à l'insertion");
    return r.message.slice(0, 45);
  });

  await etape("le droit n'est plus un droit mort", async () => {
    // C'est le constat qui a declenche ce travail : le catalogue annoncait un
    // pouvoir que rien n'appliquait.
    const morts = (
      await c.query(`select code from public.droits_jamais_consultes() where sensible order by code`)
    ).rows.map((l) => l.code);
    if (morts.includes("utilisateurs.suspendre"))
      throw new Error("le droit ne s'applique toujours nulle part");
    if (morts.length) throw new Error("droits sensibles morts : " + morts.join(", "));
    return "aucun droit sensible sans porte";
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
