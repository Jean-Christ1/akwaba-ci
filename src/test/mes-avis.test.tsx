import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MesAvis } from "@/modules/account/ui/MesAvis";

/**
 * L'écran des avis reçus dans l'application.
 *
 * Le canal « dans l'application » est proposé dans les préférences, et c'est le
 * dernier maillon du routage, celui qui ne peut pas échouer. Il ne délivrait
 * nulle part : le message partait dans la file d'envoi, que seul le personnel
 * peut lire.
 *
 * Le cloisonnement est prouvé côté serveur, contre la vraie base, par
 * `scripts/recette-file-et-avis.mjs`. Ce qui se vérifie ici est l'autre moitié :
 * que l'écran montre les avis, distingue ceux qui sont neufs, et n'invente pas
 * un état de lecture que le serveur n'a pas confirmé.
 */

const AVIS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    evenement: "message_support",
    sujet: "Suite à votre appel",
    corps: "Votre remboursement a été validé.",
    errand_id: null,
    recu_le: "2026-08-27T09:00:00Z",
    lue_le: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    evenement: "errand_status",
    sujet: "Votre course est en route",
    corps: "Le shopper a récupéré vos articles.",
    errand_id: "33333333-3333-3333-3333-333333333333",
    recu_le: "2026-08-26T09:00:00Z",
    lue_le: "2026-08-26T10:00:00Z",
  },
];

const appels: { url: string; corps: unknown }[] = [];

function servir(avis = AVIS) {
  appels.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    entree: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    appels.push({ url, corps: init?.body ? JSON.parse(String(init.body)) : null });
    const corps: unknown = url.includes("avis_marquer_lu") ? 1 : avis;
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

const afficher = () =>
  render(
    <MemoryRouter>
      <MesAvis />
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("les avis reçus dans l'application", { timeout: 30_000 }, () => {
  it("montre les avis, leur sujet et leur corps", async () => {
    servir();
    afficher();

    expect(await screen.findByText("Suite à votre appel")).toBeInTheDocument();
    expect(screen.getByText("Votre remboursement a été validé.")).toBeInTheDocument();
    expect(screen.getByText("Votre course est en route")).toBeInTheDocument();
  });

  it("compte les avis neufs et n'offre le geste que pour eux", async () => {
    servir();
    afficher();

    await screen.findByText("Suite à votre appel");
    // Un seul des deux est neuf : le compteur le dit, et un seul bouton
    // « Marquer lu » existe.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Marquer lu" })).toHaveLength(1);
  });

  it("un avis lié à une course renvoie vers elle", async () => {
    servir();
    afficher();

    const lien = await screen.findByRole("link", { name: "Voir la course" });
    expect(lien).toHaveAttribute("href", "/courses/33333333-3333-3333-3333-333333333333");
  });

  it("marquer un avis lu envoie son identifiant, tout marquer n'en envoie aucun", async () => {
    servir();
    const utilisateur = userEvent.setup();
    afficher();

    await screen.findByText("Suite à votre appel");
    await utilisateur.click(screen.getByRole("button", { name: "Marquer lu" }));
    await waitFor(() => {
      const appel = appels.find((a) => a.url.includes("avis_marquer_lu"));
      expect(appel?.corps).toMatchObject({ p_id: AVIS[0].id });
    });

    appels.length = 0;
    await utilisateur.click(screen.getByRole("button", { name: /Tout marquer comme lu/ }));
    await waitFor(() => {
      const appel = appels.find((a) => a.url.includes("avis_marquer_lu"));
      expect(appel?.corps).toMatchObject({ p_id: null });
    });
  });

  it("dit quoi faire quand il n'y a rien, plutôt que de rester vide", async () => {
    // Un cadre vide se lit comme une panne. Il vaut mieux dire pourquoi il est
    // vide et a quelle condition il se remplira.
    servir([]);
    afficher();

    expect(await screen.findByText(/Aucun avis pour l'instant/)).toBeInTheDocument();
    expect(
      screen.getByText(/si vous avez choisi d'être joint dans l'application/)
    ).toBeInTheDocument();
  });

  it("ne montre aucun compteur quand tout est lu", async () => {
    servir([{ ...AVIS[1] }]);
    afficher();

    await screen.findByText("Votre course est en route");
    expect(screen.queryByRole("button", { name: /Tout marquer comme lu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marquer lu" })).toBeNull();
  });
});
