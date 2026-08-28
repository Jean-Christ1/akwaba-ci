import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ServicesHubPage from "@/pages/services/ServicesHubPage";
import { PAY_METHODS, formatFcfa } from "@/modules/errands/domain";
import { COMMISSION_RATE, MIN_SERVICE_FEE } from "@/modules/errands/pricing";

/**
 * Garde-fou contre l'appauvrissement du hub des services.
 *
 * Le hub concentre ce que l'accueil n'a pas à porter : les quatre entrées du
 * service, le détail du prix, les moyens de paiement locaux et l'accès au
 * fonctionnement complet. Chacun de ces éléments a déjà été écrit une fois ;
 * un remaniement futur qui les ferait disparaître doit échouer ici plutôt que
 * de se découvrir en production.
 */

function afficherHub() {
  return render(
    <MemoryRouter>
      <ServicesHubPage />
    </MemoryRouter>
  );
}

/**
 * Ces controles montent la page entière et cherchent par rôle accessible. Le
 * calcul du nom accessible parcourt tout le sous-arbre de chaque élément, ce
 * qui coûte près d'une seconde et demie par requête sur une page de cette
 * taille ; le premier en enchaîne sept. Le délai est donc élargi pour ce
 * fichier, faute de quoi il échouerait sur sa durée alors que toutes ses
 * assertions passent.
 *
 * Le réseau n'y est pour rien : le socle de test le coupe, et les autres
 * contrôles du même fichier s'exécutent en une seconde et demie.
 */
/**
 * Un catalogue tel que la base le rend, réduit à trois entrées.
 *
 * Trois suffisent : ce qui est contrôlé ici est que la page rend ce qu'elle
 * reçoit, pas que la base contient les dix bonnes lignes. Cette seconde
 * question se joue contre la vraie base, dans scripts/recette-modes-de-course.mjs.
 */
const CATALOGUE = [
  {
    code: "grocery",
    libelle: "Supermarché",
    emoji: "🛒",
    exemple: "Prosuma, Carrefour, Sococé",
    description: null,
    modes_financement: ["customer_advance", "runner_advance", "on_delivery"],
    exige_panier_valide: false,
  },
  {
    code: "pharmacy",
    libelle: "Pharmacie",
    emoji: "💊",
    exemple: "Ordonnance, garde de nuit",
    description: null,
    modes_financement: ["customer_advance", "on_delivery"],
    exige_panier_valide: false,
  },
  {
    code: "parcel",
    libelle: "Colis",
    emoji: "📦",
    exemple: "Retrait, dépôt, remise en main propre",
    description: null,
    modes_financement: ["on_delivery"],
    exige_panier_valide: false,
  },
];

/**
 * Fait répondre au seul appel du catalogue, en laissant le reste muet.
 *
 * Le socle coupe le réseau et rend une liste vide. Ce test a besoin d'une
 * réponse précise, et la remplace donc localement, comme le socle l'indique.
 */
function servirCatalogue(catalogue: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    const corps = url.includes("service_modes_ouverts") ? catalogue : [];
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hub des services : rien de précieux ne doit disparaître", { timeout: 30_000 }, () => {
  it("porte les quatre entrées du service", () => {
    afficherHub();

    for (const titre of [
      "Demander une course",
      "Devenir shopper",
      "Marchands & établissements",
      "Artisans & services",
    ]) {
      expect(screen.getByRole("heading", { name: titre })).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "Demander une course" })).toHaveAttribute(
      "href",
      "/courses/nouvelle"
    );
    // Ces deux cartes sont cliquables en entier : leur nom accessible reprend
    // tout le contenu, d'où la recherche par fragment.
    expect(screen.getByRole("link", { name: /Inscrire mon commerce/ })).toHaveAttribute(
      "href",
      "/partner/signup"
    );
    expect(screen.getByRole("link", { name: /Demander un artisan/ })).toHaveAttribute(
      "href",
      "/courses/nouvelle?category=artisan"
    );
  });

  it("envoie le candidat shopper vers la candidature, jamais vers l'espace réservé", () => {
    afficherHub();

    // L'espace missions exige un profil validé : y envoyer un visiteur non
    // inscrit revient à lui présenter un mur en guise d'invitation.
    expect(screen.getByRole("link", { name: "Devenir shopper" })).toHaveAttribute(
      "href",
      "/courses/devenir-shopper"
    );
  });

  it("nomme chaque moyen de paiement local, un par un", () => {
    const { container } = afficherHub();
    const texte = container.textContent ?? "";

    for (const moyen of PAY_METHODS) {
      expect(texte, `le moyen de paiement ${moyen.label} doit rester nommé`).toContain(moyen.label);
    }
  });

  it("donne accès au fonctionnement complet, qui a quitté l'accueil", () => {
    afficherHub();

    expect(screen.getByRole("link", { name: "Comment ça marche" })).toHaveAttribute(
      "href",
      "/courses/comment-ca-marche"
    );
    expect(screen.getByRole("link", { name: /grille tarifaire/i })).toHaveAttribute(
      "href",
      "/courses/comment-ca-marche"
    );
  });

  it("distingue le budget d'achat des frais de service, avec les montants du moteur tarifaire", () => {
    const { container } = afficherHub();
    const texte = container.textContent ?? "";

    expect(screen.getByRole("heading", { name: /budget d'achat/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /frais de service/i })).toBeInTheDocument();

    // L'argent des achats appartient au marchand : aucune commission dessus.
    expect(texte).toMatch(/revient intégralement au marchand/i);
    expect(texte).toContain(`${Math.round(COMMISSION_RATE * 100)} %`);
    expect(texte).toContain(formatFcfa(MIN_SERVICE_FEE));
  });
  it("ouvre chaque catégorie servie par la base avec son contexte déjà choisi", async () => {
    // Le catalogue vient désormais du serveur, qui seul sait ce qui est ouvert.
    // On lui fait répondre une liste connue, et on vérifie que la page la rend
    // entière : perdre une catégorie ne casse rien de visible, la demande
    // correspondante devient simplement introuvable depuis le hub.
    servirCatalogue(CATALOGUE);
    afficherHub();

    for (const mode of CATALOGUE) {
      const lien = await screen.findByRole("link", {
        name: `Demander une course : ${mode.libelle}`,
      });
      expect(lien, `la catégorie ${mode.libelle} doit rester atteignable`).toHaveAttribute(
        "href",
        `/courses/nouvelle?category=${mode.code}`
      );
      expect(lien).toHaveTextContent(mode.exemple);
    }
  });

  it("ne propose rien quand le serveur ferme tout, plutôt que de replier sur une liste écrite", async () => {
    // Une liste de secours dans le code redeviendrait une seconde source de
    // vérité : elle proposerait une catégorie que la base refuse à la
    // publication, et le client ne l'apprendrait qu'à l'envoi.
    servirCatalogue([]);
    const { container } = afficherHub();

    await waitFor(() => {
      expect(container.textContent).not.toMatch(/Chargement du catalogue/);
    });
    expect(screen.queryByRole("link", { name: /^Demander une course : / })).toBeNull();
  });


  it("reste lisible : au plus six blocs de premier niveau", () => {
    const { container } = afficherHub();

    const blocs = container.querySelectorAll(":scope > div > header, :scope > div > section");
    expect(blocs.length, "un hub riche ne doit pas devenir un hub confus").toBeLessThanOrEqual(6);
    expect(blocs.length).toBeGreaterThanOrEqual(5);
  });
});
