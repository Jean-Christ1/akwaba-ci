import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/contexts/AuthContext";
import PermissionsPage from "@/pages/admin/PermissionsPage";

/**
 * L'écran de gouvernance des accès.
 *
 * Il ne peut pas être piloté dans un navigateur : il demande une session de
 * personnel, et créer un compte d'administration sur la base de production pour
 * une vérification d'affichage serait exactement ce qu'on s'interdit. Le
 * montage sous test est donc la preuve disponible, et elle porte sur ce qui
 * compte : la matrice se rend, et le tiroir dit ce qu'un droit ne permet pas.
 */

const DROITS = [
  {
    code: "courses.lire",
    categorie: "Courses",
    libelle: "Suivre les courses",
    description: "Consulter les courses et leur avancement.",
    ne_permet_pas:
      "Ne montre ni les numéros de téléphone complets, ni les moyens de paiement.",
    sensible: false,
    portee: "ville",
    rang: 10,
    roles: ["moderateur", "super_admin"],
  },
  {
    code: "shoppers.identite.lire",
    categorie: "Shoppers",
    libelle: "Ouvrir les pièces d'identité",
    description: "Ouvrir la pièce téléversée par un candidat shopper.",
    ne_permet_pas:
      "Ne permet pas de télécharger la pièce hors de l'application, ni de la transmettre.",
    sensible: true,
    portee: "global",
    rang: 20,
    roles: ["super_admin"],
  },
];

const ROLES = [
  {
    code: "moderateur",
    libelle: "Modérateur",
    description: "Courses et litiges.",
    niveau: 10,
    systeme: true,
    droits: 1,
    membres: 2,
  },
  {
    code: "super_admin",
    libelle: "Super administrateur",
    description: "Tous les droits.",
    niveau: 100,
    systeme: true,
    droits: 2,
    membres: 1,
  },
];

/**
 * Fait répondre chaque appel du serveur, en distinguant par son chemin.
 *
 * Le socle coupe le réseau et rend une liste vide, ce qui laisserait l'écran
 * dans son état de chargement. Ce test a besoin d'un catalogue précis, et le
 * remplace donc localement, comme le socle l'indique.
 */
function servir() {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    let corps: unknown = [];
    if (url.includes("catalogue_des_droits")) corps = DROITS;
    else if (url.includes("catalogue_des_roles")) corps = ROLES;
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

function afficher() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PermissionsPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("la gouvernance des accès", { timeout: 30_000 }, () => {
  it("rend la matrice avec un rôle par colonne, du moins étendu au plus étendu", async () => {
    servir();
    afficher();

    // Les rôles arrivent dans l'ordre de leur rang : c'est ce qui permet de
    // lire de gauche à droite ce que chaque échelon ajoute.
    await screen.findByText("Modérateur");
    expect(screen.getByText("Super administrateur")).toBeInTheDocument();

    // Une cellule par croisement, et son état est dit aux lecteurs d'écran :
    // un point vert seul ne dit rien à qui ne le voit pas.
    expect(
      await screen.findByText("Modérateur : accordé", { selector: ".sr-only" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Modérateur : non accordé", { selector: ".sr-only" })
    ).toBeInTheDocument();
  });

  it("groupe les droits par catégorie, et chaque groupe se replie", async () => {
    servir();
    const utilisateur = userEvent.setup();
    afficher();

    const groupe = await screen.findByRole("button", { name: /Courses/ });
    expect(groupe).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Suivre les courses/ })).toBeInTheDocument();

    await utilisateur.click(groupe);
    expect(groupe).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Suivre les courses/ })).toBeNull();
    });
  });

  it("le tiroir dit ce que le droit ne permet pas, pas seulement ce qu'il permet", async () => {
    // C'est la question de celui qui accorde, et aucune description n'y
    // répondait : « ouvrir les pièces » autorise-t-il à les télécharger ?
    servir();
    const utilisateur = userEvent.setup();
    afficher();

    await utilisateur.click(
      await screen.findByRole("button", { name: /Ouvrir les pièces d'identité/ })
    );

    const tiroir = await screen.findByRole("dialog");
    expect(within(tiroir).getByText("Ce que ce droit permet")).toBeInTheDocument();
    expect(within(tiroir).getByText("Ce qu'il ne permet pas")).toBeInTheDocument();
    expect(within(tiroir).getByText(/ne permet pas de télécharger/i)).toBeInTheDocument();
    // « sensible » apparaît deux fois, sur l'étiquette et dans l'avertissement
    // qui explique ce que cela implique : les deux comptent.
    expect(within(tiroir).getAllByText(/sensible/i).length).toBeGreaterThanOrEqual(2);
    expect(
      within(tiroir).getByText(/chaque attribution demande un motif écrit/i)
    ).toBeInTheDocument();
  });

  it("annonce la portée d'un droit restreignable à une ville", async () => {
    servir();
    const utilisateur = userEvent.setup();
    afficher();

    await utilisateur.click(await screen.findByRole("button", { name: /Suivre les courses/ }));
    const tiroir = await screen.findByRole("dialog");
    expect(within(tiroir).getByText(/Restreignable à une ou plusieurs villes/)).toBeInTheDocument();
  });

  it("porte les six onglets de la gouvernance", async () => {
    servir();
    afficher();
    for (const onglet of [
      "Matrice",
      "Droits d'une personne",
      "Comptes",
      "Périmètres",
      "Revue",
      "Réconciliation",
    ]) {
      expect(await screen.findByRole("tab", { name: onglet })).toBeInTheDocument();
    }
  });

  it("dit la lecture seule à qui ne peut pas attribuer", async () => {
    // Un écran qui montre des boutons qu'on ne peut pas actionner fait croire à
    // une panne. Mieux vaut dire pourquoi ils n'y sont pas.
    servir();
    afficher();
    expect(
      await screen.findByText(/Lecture seule : vous n'avez pas le droit d'attribuer/)
    ).toBeInTheDocument();
  });
});
