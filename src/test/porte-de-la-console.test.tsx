import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as auth from "@/contexts/AuthContext";
import { RequireRole } from "@/shared/ui/RequireRole";

/**
 * La porte d'entrée de la console.
 *
 * C'est là que tout le travail de gouvernance s'arrêtait. Le serveur avait beau
 * accorder « Approuver un retrait » à un responsable financier, la garde de
 * route lui demandait le rôle hérité `admin`, qu'il n'a pas. Les droits de la
 * matrice ouvraient tout côté base et rien côté écran : la personne voyait
 * « Accès non autorisé » sur une page dont le serveur lui aurait tout rendu.
 *
 * La garde n'est pas la barrière qui protège, et ne prétend pas l'être : le
 * serveur refuse ce qu'il doit refuser. Elle évite d'afficher un écran
 * inexploitable, et elle doit donc dire la même chose que lui.
 */

type EtatAuth = Partial<ReturnType<typeof auth.useAuth>>;

const contexte = (etat: EtatAuth) =>
  vi.spyOn(auth, "useAuth").mockReturnValue({
    user: { id: "11111111-1111-1111-1111-111111111111" },
    loading: false,
    droits: [],
    peut: () => false,
    isAdmin: false,
    isPartner: false,
    isModerator: false,
    ...etat,
  } as ReturnType<typeof auth.useAuth>);

const afficher = (element: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={["/protege"]}>
      <Routes>
        <Route element={element}>
          <Route path="/protege" element={<p>Contenu protégé</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("la porte de la console", () => {
  it("LE TROU : un droit de la matrice ouvre, sans le rôle hérité", () => {
    contexte({ droits: ["retraits.approuver"] });
    afficher(<RequireRole role="admin" droit={["retraits.approuver"]} />);
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  it("un droit voisin n'ouvre pas la porte d'à côté", () => {
    // Un responsable des dossiers de shopper n'a rien à faire dans les litiges.
    contexte({ droits: ["shoppers.lire"] });
    afficher(<RequireRole role="moderator" droit={["litiges.lire"]} />);
    expect(screen.getByText("Accès non autorisé")).toBeInTheDocument();
  });

  it("l'un des droits attendus suffit", () => {
    contexte({ droits: ["paiements.lire"] });
    afficher(<RequireRole role="admin" droit={["retraits.approuver", "paiements.lire"]} />);
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  it("le rôle hérité continue d'ouvrir, comme côté serveur", () => {
    // has_permission porte l'accès de secours : la garde ne doit pas être plus
    // stricte que le serveur, sans quoi le dernier administrateur se fermerait
    // la console à lui-même.
    contexte({ isAdmin: true, isModerator: true, isPartner: true });
    afficher(<RequireRole role="admin" droit={["retraits.approuver"]} />);
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  it("« personnel » ouvre à qui détient un droit, quel qu'il soit", () => {
    contexte({ droits: ["lieux.moderer"] });
    afficher(<RequireRole role="admin" personnel />);
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  it("« personnel » reste fermé à qui n'en détient aucun", () => {
    contexte({ droits: [] });
    afficher(<RequireRole role="admin" personnel />);
    expect(screen.getByText("Accès non autorisé")).toBeInTheDocument();
  });

  it("sans droit ni rôle, la porte reste fermée", () => {
    contexte({ droits: ["courses.lire"] });
    afficher(<RequireRole role="admin" droit={["retraits.approuver"]} />);
    expect(screen.getByText("Accès non autorisé")).toBeInTheDocument();
  });

  it("attend la résolution des droits avant de refuser", () => {
    // Refuser pendant le chargement afficherait « accès non autorisé » à
    // chaque rafraîchissement, avant que la réponse du serveur arrive.
    contexte({ loading: true, droits: [] });
    afficher(<RequireRole role="admin" droit={["retraits.approuver"]} />);
    expect(screen.getByText(/Vérification de vos accès/)).toBeInTheDocument();
    expect(screen.queryByText("Accès non autorisé")).toBeNull();
  });
});
