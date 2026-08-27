/**
 * Cree les comptes de demonstration, un par role reel de la plateforme.
 *
 * Le fichier .secret/akwaba-demo-accounts.json etait un gabarit : deux entrees,
 * tous les champs vides. Personne ne pouvait se connecter pour verifier ce
 * qu'un role donne voit reellement, ce qui est la seule facon de constater
 * qu'une matrice de droits fait ce qu'elle annonce.
 *
 * Le script est idempotent : relance, il retrouve les comptes existants et
 * remet leurs roles a jour plutot que d'en creer de nouveaux.
 *
 * Le mot de passe commun est lu dans le coffre et n'est jamais affiche.
 *
 * Usage :
 *   node scripts/comptes-demonstration.mjs           creer ou mettre a jour
 *   node scripts/comptes-demonstration.mjs --purger  supprimer les comptes
 */
import fs from "node:fs";
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const COFFRE = "C:/Users/kouas/Documents/deepl-test/94-akwaka/.secret";
const FICHIER = `${COFFRE}/akwaba-demo-accounts.json`;

const secretSupabase = JSON.parse(
  fs.readFileSync(`${COFFRE}/akwaba-supabase-secret.json`, "utf8")
).supabase;
const fiche = JSON.parse(fs.readFileSync(FICHIER, "utf8"));
const motDePasse = fiche.mot_de_passe_commun;

if (!motDePasse || motDePasse.length < 8) {
  console.error("Aucun mot de passe commun exploitable dans la fiche de demonstration.");
  process.exit(1);
}

/**
 * Un compte par role applicatif.
 *
 * Les roles du back-office (super_admin, admin_finance, admin_conformite...)
 * ne figurent PAS ici, et c'est delibere. Poser un role privilegie sur la base
 * de production, avec un mot de passe partage lisible dans un fichier, ouvre
 * un acces que rien ne justifie pour une demonstration : la matrice de droits
 * est deja eprouvee contre cette meme base par scripts/recette-droits.mjs, qui
 * cree ses comptes et les annule.
 *
 * Le drapeau --personnel les cree quand meme, pour le jour ou un projet de
 * recette distinct existera. Ne pas l'utiliser sur la production.
 */
const COMPTES = [
  {
    email: "demo.client@exemple.com",
    role: "Client",
    legacy: "user",
    attendu: "Publier une course, suivre ses courses, noter un shopper. Aucun acces au back-office.",
  },
  {
    email: "demo.shopper@exemple.com",
    role: "Shopper valide",
    legacy: "user",
    shopper: "approved",
    attendu: "Voir le marche des courses, faire une offre, saisir le code de remise, consulter son portefeuille.",
  },
  {
    email: "demo.shopper.attente@exemple.com",
    role: "Shopper en attente",
    legacy: "user",
    shopper: "pending",
    attendu: "Dossier depose sans pieces : ne peut pas prendre de course. Sert a constater que la validation refuse un dossier incomplet.",
  },
  {
    email: "demo.partenaire@exemple.com",
    role: "Partenaire",
    legacy: "partner",
    attendu: "Gerer sa fiche d'etablissement. Aucun acces aux courses ni aux finances.",
  },
  {
    email: "demo.moderateur@exemple.com",
    role: "Moderateur",
    legacy: "moderator",
    // Le declencheur sync_legacy_staff_role lui donne le perimetre du role
    // « moderateur » : c'est un compte du back-office, pas un compte applicatif.
    staff: "moderateur",
    attendu: "Courses, litiges, dossiers de shopper, lieux. Ne publie pas de bareme, n'attribue pas de roles.",
  },
  {
    email: "demo.operations@exemple.com",
    role: "Responsable exploitation",
    staff: "admin_operations",
    attendu: "Courses, litiges, villes. Ne voit ni les pieces d'identite ni les retraits.",
  },
  {
    email: "demo.finance@exemple.com",
    role: "Responsable financier",
    staff: "admin_finance",
    attendu: "Paiements, retraits, commissions, baremes. Aucun acces aux pieces d'identite.",
  },
  {
    email: "demo.conformite@exemple.com",
    role: "Responsable conformite",
    staff: "admin_conformite",
    attendu: "Pieces d'identite, validation des shoppers, journal d'audit, exports. Aucun pouvoir sur l'argent.",
  },
  {
    email: "demo.support@exemple.com",
    role: "Agent de support",
    staff: "admin_support",
    attendu: "Consultation large. Seule decision : rouvrir une remise verrouillee.",
  },
  {
    email: "demo.contenu@exemple.com",
    role: "Responsable contenu",
    staff: "admin_contenu",
    attendu: "Etablissements et moderation editoriale. Rien d'autre.",
  },
  {
    email: "demo.superadmin@exemple.com",
    role: "Super administrateur",
    staff: "super_admin",
    attendu: "Tous les droits, y compris celui d'attribuer les roles.",
  },
];

const avecPersonnel = process.argv.includes("--personnel");
const aCreer = avecPersonnel ? COMPTES : COMPTES.filter((x) => !x.staff);

if (!avecPersonnel) {
  console.log("Comptes applicatifs seulement.");
  console.log("Les roles du back-office demandent --personnel, a n'utiliser que sur un");
  console.log("projet de recette distinct de la production.");
  console.log("");
}

const c = new pg.Client(exigerConfiguration("comptes de demonstration"));
await c.connect();

if (process.argv.includes("--purger")) {
  const r = await c.query(
    `delete from auth.users where email = any($1::text[]) returning email`,
    [COMPTES.map((x) => x.email)]
  );
  console.log(`${r.rowCount} compte(s) supprime(s).`);
  await c.end();
  process.exit(0);
}

await c.query("begin");
const resultats = [];

try {
  for (const compte of aCreer) {
    // Creation directe dans auth.users : le mot de passe est hache par bcrypt,
    // comme le fait Supabase. Le courriel est marque confirme, sans quoi la
    // connexion serait refusee et le compte inutilisable pour la recette.
    const existe = (
      await c.query(`select id from auth.users where email = $1`, [compte.email])
    ).rows[0];

    let uid;
    if (existe) {
      uid = existe.id;
      await c.query(
        `update auth.users
            set encrypted_password = crypt($2, gen_salt('bf')),
                email_confirmed_at = coalesce(email_confirmed_at, now()),
                confirmation_token = coalesce(confirmation_token, ''),
                recovery_token = coalesce(recovery_token, ''),
                email_change_token_new = coalesce(email_change_token_new, ''),
                email_change = coalesce(email_change, ''),
                updated_at = now()
          where id = $1`,
        [uid, motDePasse]
      );
    } else {
      uid = (
        await c.query(
          // Les quatre colonnes de jetons doivent valoir la chaine vide, pas
          // NULL. Le service d'authentification les lit comme des chaines et
          // refuse le compte entier sur un NULL, avec pour seul message
          // « Database error querying schema » : la creation reussit en base,
          // et la connexion echoue sans rapport apparent avec la cause.
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
             email_confirmed_at, confirmation_token, recovery_token,
             email_change_token_new, email_change,
             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
           values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', $1, crypt($2, gen_salt('bf')), now(),
             '', '', '', '',
             '{"provider":"email","providers":["email"]}'::jsonb,
             jsonb_build_object('full_name', $3::text), now(), now())
           returning id`,
          [compte.email, motDePasse, `Demo ${compte.role}`]
        )
      ).rows[0].id;
    }

    // Le profil peut manquer si le declencheur d'inscription ne s'applique pas
    // a une creation directe.
    await c.query(
      `insert into public.profiles (id, display_name)
       values ($1, $2) on conflict (id) do update set display_name = excluded.display_name`,
      [uid, `Demo ${compte.role}`]
    );

    // Role herite. Le declencheur sync_legacy_staff_role donnera au moderateur
    // son perimetre d'exploitation sans qu'on ait a l'ecrire ici.
    const legacy = compte.legacy ?? "user";
    await c.query(
      `insert into public.user_roles (user_id, role)
       values ($1, $2::app_role) on conflict do nothing`,
      [uid, legacy]
    );

    if (compte.staff) {
      await c.query(
        `insert into public.staff_assignments (user_id, role_code)
         values ($1, $2) on conflict do nothing`,
        [uid, compte.staff]
      );
    }

    if (compte.shopper) {
      const complet = compte.shopper === "approved";
      await c.query(
        `insert into public.runner_profiles
           (user_id, full_name, phone, city, vehicle, status,
            date_of_birth, id_document_type, id_document_expires_on, id_doc_url, selfie_url,
            identity_submitted_at, identity_reviewed_at)
         values ($1, $2, '0700000000', 'Abidjan', 'moto', $3::runner_status,
            $4::date, $5, $6::date, $7, $8, $9, $10)
         on conflict (user_id) do update set
            status = excluded.status,
            date_of_birth = excluded.date_of_birth,
            id_document_type = excluded.id_document_type,
            id_document_expires_on = excluded.id_document_expires_on,
            id_doc_url = excluded.id_doc_url,
            selfie_url = excluded.selfie_url`,
        [
          uid,
          `Demo ${compte.role}`,
          compte.shopper,
          complet ? "1995-06-15" : null,
          complet ? "cni" : null,
          complet ? "2032-01-01" : null,
          complet ? `${uid}/piece-demonstration.jpg` : null,
          complet ? `${uid}/selfie-demonstration.jpg` : null,
          complet ? new Date().toISOString() : null,
          complet ? new Date().toISOString() : null,
        ]
      );
    }

    const droits = (
      await c.query(
        `select coalesce(array_agg(p.code order by p.position), array[]::text[]) d
           from public.permissions p
          where public.has_permission($1, p.code)`,
        [uid]
      )
    ).rows[0].d;

    resultats.push({
      email: compte.email,
      role: compte.role,
      appartenance_espace: compte.staff ? "Back-office" : "Application",
      attendu: compte.attendu,
      droits_effectifs: droits.length,
    });
    console.log(`  ${compte.email.padEnd(34)} ${compte.role.padEnd(28)} ${droits.length} droit(s)`);
  }

  await c.query("commit");
} catch (e) {
  await c.query("rollback");
  console.error("ECHEC, aucun compte cree :", e.message);
  await c.end();
  process.exit(1);
}

await c.end();

// La fiche est mise a jour dans le coffre, jamais dans le depot. Le mot de
// passe commun n'est pas reecrit : il etait deja la, et le recopier depuis ce
// script le ferait transiter sans raison.
const miseAJour = {
  ...fiche,
  note:
    "Profils de demonstration akwaba. Domaine @exemple.com (jetable, pas de vrai email). " +
    "Seuls les roles applicatifs sont crees : aucun compte du back-office, aucun mot de passe " +
    "partage ne porte de role privilegie. La matrice de droits est eprouvee separement par " +
    "scripts/recette-droits.mjs, qui cree ses comptes et les annule. " +
    "Purge : node scripts/comptes-demonstration.mjs --purger",
  back_office_url: "https://akwaba.pages.dev/admin",
  api_url: `${secretSupabase.url}`,
  connexion_url: "https://akwaba.pages.dev/auth",
  mis_a_jour_le: new Date().toISOString().slice(0, 10),
  comptes: resultats,
  nettoyage: "node scripts/comptes-demonstration.mjs --purger",
};

fs.writeFileSync(FICHIER, JSON.stringify(miseAJour, null, 2), "utf8");
console.log(`\n${resultats.length} comptes prets. Fiche mise a jour dans le coffre.`);
