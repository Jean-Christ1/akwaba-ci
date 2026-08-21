/**
 * Crée les comptes de démonstration.
 *
 * Un compte par profil, avec un mot de passe commun, pour parcourir
 * l'application dans chaque rôle sans avoir à en fabriquer un à la main.
 *
 * Ces comptes sont destinés à la recette, jamais à la production : ils portent
 * un domaine de courriel réservé aux exemples, et le script refuse de les créer
 * si des données réelles existent déjà, afin de ne pas polluer une base vivante.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-accounts.mjs
 *
 * Pour supprimer ces comptes :
 *   ... node scripts/seed-demo-accounts.mjs --purge
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_ROLE) {
  console.error(
    "Variables manquantes. Attendu : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const MOT_DE_PASSE = process.env.DEMO_PASSWORD ?? "AkwabaDemo2026!";

/**
 * Domaine réservé aux exemples par la norme : aucun courriel n'y sera jamais
 * délivré, donc aucun risque d'écrire à un tiers par accident.
 */
const COMPTES = [
  {
    email: "client@example.com",
    nom: "Aya Client",
    roles: ["user"],
    apercu: "Publie des courses, réserve des adresses, suit ses demandes.",
  },
  {
    email: "shopper@example.com",
    nom: "Koffi Shopper",
    roles: ["user"],
    shopper: { statut: "approved", ville: "Abidjan", vehicule: "moto" },
    apercu: "Shopper validé : voit le marché, propose ses prix, exécute et se fait payer.",
  },
  {
    email: "shopper-attente@example.com",
    nom: "Awa Candidate",
    roles: ["user"],
    shopper: { statut: "pending", ville: "Abidjan", vehicule: "tricycle" },
    apercu: "Candidature en attente : sert à tester la validation par un modérateur.",
  },
  {
    email: "partenaire@example.com",
    nom: "Hôtel Partenaire",
    roles: ["user", "partner"],
    apercu: "Établissement : gère ses fiches et reçoit les demandes de réservation.",
  },
  {
    email: "moderateur@example.com",
    nom: "Moïse Modérateur",
    roles: ["user", "moderator"],
    apercu: "Modère les fiches, valide les shoppers, tranche les litiges.",
  },
  {
    email: "admin@example.com",
    nom: "Adjoua Administratrice",
    roles: ["user", "admin"],
    apercu: "Console complète : pilotage, paramètres, moyens de paiement, retraits.",
  },
];

const client = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const purge = process.argv.includes("--purge");

async function trouverParCourriel(email) {
  // L'API d'administration ne cherche pas par courriel : on parcourt les pages.
  let page = 1;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const trouve = data.users.find((u) => u.email === email);
    if (trouve) return trouve;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function supprimerComptes() {
  for (const compte of COMPTES) {
    const existant = await trouverParCourriel(compte.email);
    if (!existant) continue;
    await client.auth.admin.deleteUser(existant.id);
    console.log(`Supprimé : ${compte.email}`);
  }
}

async function creerComptes() {
  // Garde-fou : on ne sème pas des comptes de démonstration dans une base qui
  // porte déjà de vraies courses.
  const { count } = await client
    .from("errands")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 20 && !process.argv.includes("--force")) {
    console.error(
      `La base contient ${count} courses : elle semble en service. ` +
        "Relancez avec --force si vous voulez tout de même créer les comptes de démonstration."
    );
    process.exit(1);
  }

  for (const compte of COMPTES) {
    let utilisateur = await trouverParCourriel(compte.email);

    if (utilisateur) {
      await client.auth.admin.updateUserById(utilisateur.id, { password: MOT_DE_PASSE });
      console.log(`Mot de passe réinitialisé : ${compte.email}`);
    } else {
      const { data, error } = await client.auth.admin.createUser({
        email: compte.email,
        password: MOT_DE_PASSE,
        email_confirm: true,
        user_metadata: { display_name: compte.nom },
      });
      if (error) {
        console.error(`Échec pour ${compte.email} : ${error.message}`);
        continue;
      }
      utilisateur = data.user;
      console.log(`Créé : ${compte.email}`);
    }

    // Le profil est posé par un déclencheur à l'inscription : on complète le nom.
    await client
      .from("profiles")
      .update({ display_name: compte.nom })
      .eq("id", utilisateur.id);

    for (const role of compte.roles) {
      await client
        .from("user_roles")
        .upsert({ user_id: utilisateur.id, role }, { onConflict: "user_id,role" });
    }

    if (compte.shopper) {
      await client.from("runner_profiles").upsert(
        {
          user_id: utilisateur.id,
          full_name: compte.nom,
          phone: "+2250700000000",
          city: compte.shopper.ville,
          vehicle: compte.shopper.vehicule,
          status: compte.shopper.statut,
          zones: ["Cocody Centre", "Plateau Centre"],
        },
        { onConflict: "user_id" }
      );

      if (compte.shopper.statut === "approved") {
        await client
          .from("runner_payout_accounts")
          .upsert(
            {
              user_id: utilisateur.id,
              provider: "wave",
              account_number: "0700000000",
              account_name: compte.nom,
              is_default: true,
            },
            { onConflict: "user_id,provider,account_number" }
          )
          .then(() => {}, () => {});
      }
    }
  }

  console.log("\nComptes de démonstration prêts.");
  console.log(`Mot de passe commun : ${MOT_DE_PASSE}\n`);
  for (const c of COMPTES) {
    console.log(`  ${c.email.padEnd(30)} ${c.apercu}`);
  }
}

if (purge) {
  await supprimerComptes();
} else {
  await creerComptes();
}
