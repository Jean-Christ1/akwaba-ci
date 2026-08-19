import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Garde-fou de hiérarchie et de longueur sur l'accueil.
 *
 * Le Shopper est le service principal d'Akwaba, la découverte de lieux une
 * verticale complémentaire. L'accueil empilait pourtant les deux, si bien que
 * le visiteur défilait longtemps et que les deux métiers se diluaient l'un dans
 * l'autre.
 *
 * Une bascule sépare désormais les deux univers et n'en montre qu'un à la fois.
 * Ces tests verrouillent les trois propriétés qui comptent : le service est
 * annoncé dès la première ligne, les courses sont l'univers par défaut, et la
 * page reste courte.
 */

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

async function afficherAccueil() {
  const { default: HomePage } = await import("@/pages/HomePage");
  const vue = render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  await waitFor(
    () => {
      expect(screen.getAllByRole("link", { name: "Demander une course" }).length).toBeGreaterThan(0);
    },
    { timeout: 15000 }
  );

  return vue;
}

describe("accueil : le Shopper est le service principal", () => {
  beforeEach(() => {
    // Le choix d'univers survit à la visite : sans remise à zéro, un test qui
    // bascule fausserait le suivant.
    window.localStorage.clear();
  });

  it(
    "annonce le service dès la première ligne, pas seulement plus bas",
    { timeout: 30000 },
    async () => {
      const { container } = await afficherAccueil();

      const titre = container.querySelector("h1");
      expect(titre, "l'accueil doit avoir un titre principal").toBeTruthy();
      expect(titre?.textContent ?? "").toMatch(/course/i);

      const heros = container.querySelector("section");
      const liens = heros?.querySelectorAll('a[href="/courses/nouvelle"]') ?? [];
      expect(liens.length, "le héros doit porter l'accès à la demande de course").toBeGreaterThan(0);
    }
  );

  it(
    "expose les deux portes du service, sans le mode d'emploi",
    { timeout: 30000 },
    async () => {
      await afficherAccueil();

      expect(screen.getAllByRole("link", { name: "Demander une course" })[0]).toHaveAttribute(
        "href",
        "/courses/nouvelle"
      );
      expect(screen.getByRole("link", { name: "Devenir shopper" })).toHaveAttribute(
        "href",
        "/courses/devenir-shopper"
      );

      // Le mode d'emploi reste en ligne, atteignable par le pied de page et le
      // hub des services, mais l'accueil ne le met plus en avant : il retardait
      // l'action au lieu de la servir.
      expect(
        screen.queryByRole("link", { name: "Comment ça marche" }),
        "l'accueil ne doit plus proposer le mode d'emploi"
      ).toBeNull();
    }
  );

  it(
    "n'affiche qu'un univers à la fois, les courses par défaut",
    { timeout: 30000 },
    async () => {
      const { container } = await afficherAccueil();

      const bascule = screen.getByRole("tablist", { name: /univers/i });
      expect(bascule).toBeInTheDocument();

      const ongletCourses = screen.getByRole("tab", { name: /mes courses/i });
      expect(ongletCourses).toHaveAttribute("aria-selected", "true");

      // La découverte n'est pas sous les yeux : c'est ce qui garde la page
      // courte, là où l'empilement des deux univers obligeait à défiler.
      expect(container.textContent ?? "").not.toMatch(/itinéraires pensés/i);

      const sections = container.querySelectorAll("section");
      expect(sections.length, "la vue courses doit rester courte").toBeLessThanOrEqual(4);
    }
  );

  it(
    "bascule vers la découverte quand on la demande",
    { timeout: 30000 },
    async () => {
      const { container } = await afficherAccueil();

      const ongletDecouverte = screen.getByRole("tab", { name: /découvrir/i });
      fireEvent.click(ongletDecouverte);

      await waitFor(() => {
        expect(ongletDecouverte).toHaveAttribute("aria-selected", "true");
      });

      expect(container.textContent ?? "").toMatch(/itinéraires pensés/i);
    }
  );
});
