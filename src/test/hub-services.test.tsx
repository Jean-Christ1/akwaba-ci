import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ServicesHubPage from "@/pages/services/ServicesHubPage";
import { CATEGORIES, PAY_METHODS, formatFcfa } from "@/modules/errands/domain";
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
  it("ouvre chaque catégorie du catalogue avec son contexte déjà choisi", () => {
    afficherHub();

    // Le catalogue est la seule porte qui pré-remplit le formulaire. Perdre une
    // catégorie ne casse rien de visible : la demande correspondante devient
    // simplement introuvable depuis le hub, sans que personne ne le remarque.
    for (const categorie of CATEGORIES) {
      const lien = screen.getByRole("link", {
        name: `Demander une course : ${categorie.label}`,
      });
      expect(lien, `la catégorie ${categorie.label} doit rester atteignable`).toHaveAttribute(
        "href",
        `/courses/nouvelle?category=${categorie.value}`
      );
      expect(lien).toHaveTextContent(categorie.hint);
    }
  });


  it("reste lisible : au plus six blocs de premier niveau", () => {
    const { container } = afficherHub();

    const blocs = container.querySelectorAll(":scope > div > header, :scope > div > section");
    expect(blocs.length, "un hub riche ne doit pas devenir un hub confus").toBeLessThanOrEqual(6);
    expect(blocs.length).toBeGreaterThanOrEqual(5);
  });
});
