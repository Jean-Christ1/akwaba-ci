import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

/**
 * Garde-fou de hiérarchie sur l'accueil.
 *
 * Le Shopper est le service principal d'Akwaba : la découverte de lieux est une
 * verticale complémentaire. Une page d'accueil qui enterre la demande de course
 * sous les sections éditoriales inverse la stratégie produit sans que personne
 * ne s'en aperçoive à la relecture d'un écran. Ce test contrôle donc à la fois
 * la présence des accès au service et leur position dans l'ordre du document.
 */

// Réponse vide mais bien formée : l'accueil doit suivre son chemin normal sans
// toucher à la base. Seul le rendu est testé ici.
const reponseVide = { data: [], error: null };
const reponseUnique = { data: null, error: null };

const chaine = () => {
  const builder: Record<string, unknown> = {};
  const methodes = ["select", "eq", "neq", "in", "is", "not", "order", "limit", "filter", "range"];
  for (const m of methodes) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(reponseUnique));
  builder.single = vi.fn(() => Promise.resolve(reponseUnique));
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(reponseVide).then(resolve);
  return builder;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => chaine()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

/**
 * Repères des sections de découverte. Chacun est le titre d'une section
 * éditoriale de l'accueil : si l'un d'eux remonte au-dessus des accès au
 * service Shopper, la page ne dit plus ce que le produit est.
 */
const REPERES_DECOUVERTE = [
  "Les autres services Akwaba",
  "Les adresses qui méritent vraiment le déplacement",
  "Bien dîner, sans hésiter",
  "Des itinéraires pensés par notre équipe",
  "Où voulez-vous aller ?",
];

/** Vrai si `premier` précède strictement `second` dans l'ordre du document. */
function precede(premier: Element, second: Element) {
  return Boolean(premier.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

async function afficherAccueil() {
  const { default: HomePage } = await import("@/pages/HomePage");
  const vue = render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
  // Le catalogue se charge après le montage : on attend que la page soit stable.
  await waitFor(
    () => {
      expect(screen.getByRole("link", { name: "Demander une course" })).toBeInTheDocument();
    },
    { timeout: 15000 }
  );
  return vue;
}

describe("accueil : le Shopper est le service principal", () => {
  // Les contrôles sont regroupés en deux cas : monter l'accueil complet coûte
  // plusieurs secondes, et multiplier les montages fragilise toute la suite.
  it("expose les trois accès au service et des cas d'usage réels", { timeout: 30000 }, async () => {
    const { container } = await afficherAccueil();

    expect(screen.getByRole("link", { name: "Demander une course" })).toHaveAttribute(
      "href",
      "/courses/nouvelle"
    );
    expect(screen.getByRole("link", { name: "Comment ça marche" })).toHaveAttribute(
      "href",
      "/courses/comment-ca-marche"
    );
    expect(screen.getByRole("link", { name: "Devenir shopper" })).toHaveAttribute(
      "href",
      "/courses/devenir-shopper"
    );

    const casUsage = Array.from(
      container.querySelectorAll('a[href^="/courses/nouvelle?category="]')
    );
    expect(casUsage.length).toBeGreaterThanOrEqual(3);

    const { CATEGORIES } = await import("@/modules/errands/domain");
    const valeurs = new Set(CATEGORIES.map((c) => c.value as string));
    for (const lien of casUsage) {
      const categorie = lien.getAttribute("href")?.split("category=")[1] ?? "";
      // Une catégorie inconnue du domaine serait ignorée par le formulaire, qui
      // retomberait silencieusement sur son choix par défaut.
      expect(valeurs.has(categorie), `catégorie inconnue : ${categorie}`).toBe(true);
      // Le libellé seul ne dit pas ce que le clic déclenche.
      expect(lien.getAttribute("aria-label")).toMatch(/^Demander une course : /);
    }
  });

  it("place ces accès avant toutes les sections de découverte", { timeout: 30000 }, async () => {
    const { container } = await afficherAccueil();

    const cta = screen.getByRole("link", { name: "Demander une course" });
    const methode = screen.getByRole("link", { name: "Comment ça marche" });

    for (const repere of REPERES_DECOUVERTE) {
      const titre = screen.getByText(repere);
      expect(precede(cta, titre), `« Demander une course » doit précéder « ${repere} »`).toBe(true);
      expect(precede(methode, titre), `« Comment ça marche » doit précéder « ${repere} »`).toBe(
        true
      );
    }

    // Les pastilles de catégories touristiques appartiennent elles aussi à la
    // découverte : elles ne doivent pas non plus passer devant le service.
    const premiereCategorie = container.querySelector('a[href^="/explorer?type="]');
    expect(premiereCategorie).not.toBeNull();
    expect(precede(cta, premiereCategorie as Element)).toBe(true);

    // Les raccourcis par catégorie appartiennent au même bloc et le suivent.
    const premierCas = container.querySelector('a[href^="/courses/nouvelle?category="]');
    expect(premierCas).not.toBeNull();
    expect(precede(premierCas as Element, screen.getByText("Les autres services Akwaba"))).toBe(
      true
    );
  });
});
