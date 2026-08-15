import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Montage réel de chaque écran.
 *
 * Vérifier qu'une route répond en HTTP ne prouve rien dans une application à
 * page unique : le serveur renvoie la même coquille pour tout. Ce test monte
 * véritablement chaque écran et échoue si l'un d'eux lève à la construction,
 * ce qui est la panne la plus courante après un remaniement.
 *
 * L'accès aux données est simulé ici, et uniquement ici : le but est de tester
 * le rendu, pas la base.
 */

// Réponse vide mais bien formée, pour que les écrans suivent leur chemin normal.
const reponseVide = { data: [], error: null };
const reponseUnique = { data: null, error: null };

const chaine = () => {
  const builder: Record<string, unknown> = {};
  const methodes = [
    "select", "eq", "neq", "in", "is", "not", "order", "limit", "gte", "lte",
    "filter", "range", "insert", "update", "delete", "upsert",
  ];
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
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    storage: { from: vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn() })) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

// Le service worker et la géolocalisation n'ont pas leur place dans un test.
vi.mock("@/shared/pwa/registerServiceWorker", () => ({ registerServiceWorker: vi.fn() }));

const ROUTES = [
  { chemin: "/", nom: "Accueil" },
  { chemin: "/explorer", nom: "Explorer" },
  { chemin: "/carte", nom: "Carte" },
  { chemin: "/parcours", nom: "Parcours" },
  { chemin: "/favoris", nom: "Favoris" },
  { chemin: "/profil", nom: "Profil" },
  { chemin: "/services", nom: "Services" },
  { chemin: "/courses", nom: "Mes courses" },
  { chemin: "/courses/nouvelle", nom: "Nouvelle course" },
  { chemin: "/courses/comment-ca-marche", nom: "Comment ça marche" },
  { chemin: "/courses/portefeuille", nom: "Portefeuille" },
  { chemin: "/courses/devenir-shopper", nom: "Devenir shopper" },
  { chemin: "/itineraire", nom: "Itinéraire" },
  { chemin: "/auth", nom: "Connexion" },
  { chemin: "/conditions", nom: "Conditions générales" },
  { chemin: "/confidentialite", nom: "Confidentialité" },
  { chemin: "/partner/signup", nom: "Inscription partenaire" },
  { chemin: "/admin", nom: "Back-office" },
  { chemin: "/admin/pilotage", nom: "Pilotage" },
  { chemin: "/admin/parametres", nom: "Paramètres" },
  { chemin: "/admin/litiges", nom: "Litiges" },
  { chemin: "/admin/courses", nom: "Suivi des courses" },
  { chemin: "/admin/payouts", nom: "Retraits" },
  { chemin: "/admin/shoppers", nom: "Shoppers" },
  { chemin: "/route-qui-nexiste-pas", nom: "Page introuvable" },
];

let erreursConsole: string[] = [];

beforeEach(() => {
  erreursConsole = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    erreursConsole.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("montage de chaque écran", () => {
  for (const route of ROUTES) {
    // Délai large : le premier montage paie la compilation de tout l'arbre.
    it(`monte ${route.nom} (${route.chemin}) sans plantage`, { timeout: 30000 }, async () => {
      window.history.pushState({}, "", route.chemin);

      const { default: App } = await import("@/App");
      render(<App />);

      // Le rendu est asynchrone : les écrans sont chargés à la demande.
      await waitFor(
        () => {
          expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0);
        },
        { timeout: 15000 }
      );

      // La frontière d'erreur ne doit jamais s'être déclenchée.
      expect(screen.queryByText(/une erreur est survenue/i)).not.toBeInTheDocument();

      // Aucune erreur React de rendu ne doit avoir été signalée.
      const graves = erreursConsole.filter(
        (e) =>
          e.includes("Rendered more hooks") ||
          e.includes("hook order") ||
          e.includes("Cannot read properties of undefined") ||
          e.includes("is not a function")
      );
      expect(graves, `erreurs de rendu sur ${route.chemin}`).toEqual([]);
    });
  }
});
