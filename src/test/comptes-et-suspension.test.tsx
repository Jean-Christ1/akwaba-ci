import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComptesEtSuspension } from "@/modules/admin/gouvernance/ComptesEtSuspension";

/**
 * L'écran des comptes et de la suspension.
 *
 * Il ne peut pas être piloté dans un navigateur : il demande une session de
 * personnel, et créer un compte d'administration sur la base de production pour
 * une vérification d'affichage serait exactement ce qu'on s'interdit. Les refus
 * du serveur sont prouvés par la recette, contre la vraie base. Ce qui se
 * vérifie ici est l'autre moitié : ce que l'écran montre, et ce qu'il cache à
 * qui n'a pas le droit.
 */

const COMPTES = [
  {
    user_id: "11111111-1111-1111-1111-111111111111",
    courriel: "konan@exemple.ci",
    nom_affiche: "Konan Yao",
    telephone: "0709887766",
    cree_le: "2026-03-04T10:00:00Z",
    suspendu_le: null,
    suspendu_motif: null,
    suspendu_par_courriel: null,
    roles: [],
    courses: 3,
  },
  {
    user_id: "22222222-2222-2222-2222-222222222222",
    courriel: "aya@exemple.ci",
    nom_affiche: "Aya Kouassi",
    telephone: null,
    cree_le: "2026-01-10T10:00:00Z",
    suspendu_le: "2026-08-20T09:00:00Z",
    suspendu_motif: "Colis réclamés jamais reçus",
    suspendu_par_courriel: "support@akwaba.ci",
    roles: ["moderateur"],
    courses: 12,
  },
];

/** Retient ce qui est envoyé au serveur, pour vérifier l'appel lui-même. */
const appels: { url: string; corps: unknown }[] = [];

function servir() {
  appels.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    entree: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    appels.push({
      url,
      corps: init?.body ? JSON.parse(String(init.body)) : null,
    });
    let corps: unknown = [];
    if (url.includes("annuaire_des_comptes")) corps = COMPTES;
    else if (url.includes("compte_suspendre")) corps = { suspendu: true };
    else if (url.includes("message_envoyer")) corps = { canal: "email" };
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("les comptes et la suspension", { timeout: 30_000 }, () => {
  it("montre l'adresse, les rôles et l'état de suspension avec son motif", async () => {
    servir();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire", "utilisateurs.suspendre"]} />);

    await screen.findByText("Konan Yao");
    expect(screen.getByText(/konan@exemple\.ci/)).toBeInTheDocument();

    // Un compte suspendu doit dire pourquoi et par qui : sans cela, la levée se
    // déciderait à l'aveugle.
    expect(screen.getByText("suspendu")).toBeInTheDocument();
    expect(screen.getByText(/Colis réclamés jamais reçus/)).toBeInTheDocument();
    expect(screen.getByText(/support@akwaba\.ci/)).toBeInTheDocument();
    expect(screen.getByText("moderateur")).toBeInTheDocument();
  });

  it("cache les gestes à qui n'a que la lecture, et dit pourquoi", async () => {
    // Un écran qui montre des boutons qu'on ne peut pas actionner fait croire à
    // une panne.
    servir();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire"]} />);

    await screen.findByText("Konan Yao");
    expect(screen.queryByRole("button", { name: "Suspendre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Écrire" })).toBeNull();
    expect(
      screen.getByText(/vous n'avez pas le droit de suspendre/i)
    ).toBeInTheDocument();
  });

  it("refuse d'envoyer une suspension sans motif, avant même le serveur", async () => {
    servir();
    const utilisateur = userEvent.setup();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire", "utilisateurs.suspendre"]} />);

    await screen.findByText("Konan Yao");
    await utilisateur.click(screen.getAllByRole("button", { name: /Suspendre/ })[0]);

    const boite = await screen.findByRole("alertdialog");
    await utilisateur.click(within(boite).getByRole("button", { name: "Suspendre" }));

    await waitFor(() => {
      expect(appels.some((a) => a.url.includes("compte_suspendre"))).toBe(false);
    });
  });

  it("envoie la suspension avec son motif quand il est écrit", async () => {
    servir();
    const utilisateur = userEvent.setup();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire", "utilisateurs.suspendre"]} />);

    await screen.findByText("Konan Yao");
    await utilisateur.click(screen.getAllByRole("button", { name: /Suspendre/ })[0]);

    const boite = await screen.findByRole("alertdialog");
    await utilisateur.type(
      within(boite).getByLabelText(/Motif/),
      "Trois signalements concordants"
    );
    await utilisateur.click(within(boite).getByRole("button", { name: "Suspendre" }));

    await waitFor(() => {
      const appel = appels.find((a) => a.url.includes("compte_suspendre"));
      expect(appel).toBeDefined();
      expect(appel?.corps).toMatchObject({
        p_user_id: COMPTES[0].user_id,
        p_suspendre: true,
        p_motif: "Trois signalements concordants",
      });
    });
  });

  it("la réactivation ne demande pas de motif et n'en envoie pas", async () => {
    servir();
    const utilisateur = userEvent.setup();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire", "utilisateurs.suspendre"]} />);

    await screen.findByText("Aya Kouassi");
    await utilisateur.click(screen.getByRole("button", { name: /Réactiver/ }));

    const boite = await screen.findByRole("alertdialog");
    expect(within(boite).queryByLabelText(/Motif/)).toBeNull();
    await utilisateur.click(within(boite).getByRole("button", { name: "Réactiver" }));

    await waitFor(() => {
      const appel = appels.find((a) => a.url.includes("compte_suspendre"));
      expect(appel?.corps).toMatchObject({
        p_user_id: COMPTES[1].user_id,
        p_suspendre: false,
        p_motif: null,
      });
    });
  });

  it("écrire au compte passe par le geste du serveur, jamais par une adresse en clair", async () => {
    // La console ne doit pas devenir un carnet d'adresses d'ou l'on ecrit
    // depuis sa propre messagerie : le message part de la plateforme, avec sa
    // trace.
    servir();
    const utilisateur = userEvent.setup();
    render(
      <ComptesEtSuspension mesDroits={["utilisateurs.lire", "notifications.envoyer"]} />
    );

    await screen.findByText("Konan Yao");
    await utilisateur.click(screen.getAllByRole("button", { name: /Écrire/ })[0]);

    const boite = await screen.findByRole("alertdialog");
    await utilisateur.type(within(boite).getByLabelText(/Sujet/), "Suite à votre appel");
    await utilisateur.type(
      within(boite).getByLabelText(/Message/),
      "Votre remboursement a été validé, il arrive sous 48 heures."
    );
    await utilisateur.click(within(boite).getByRole("button", { name: "Envoyer" }));

    await waitFor(() => {
      const appel = appels.find((a) => a.url.includes("message_envoyer"));
      expect(appel?.corps).toMatchObject({
        p_user_id: COMPTES[0].user_id,
        p_sujet: "Suite à votre appel",
      });
    });
  });

  it("dit le refus du serveur au lieu de faire croire à un envoi", async () => {
    servir();
    vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
      const url = typeof entree === "string" ? entree : entree.toString();
      if (url.includes("annuaire_des_comptes")) {
        return new Response(JSON.stringify(COMPTES), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ message: "Vous ne pouvez pas suspendre votre propre compte." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch);

    const utilisateur = userEvent.setup();
    render(<ComptesEtSuspension mesDroits={["utilisateurs.lire", "utilisateurs.suspendre"]} />);

    await screen.findByText("Konan Yao");
    await utilisateur.click(screen.getAllByRole("button", { name: /Suspendre/ })[0]);
    const boite = await screen.findByRole("alertdialog");
    await utilisateur.type(within(boite).getByLabelText(/Motif/), "Motif suffisant");
    await utilisateur.click(within(boite).getByRole("button", { name: "Suspendre" }));

    // La boite reste ouverte : un refus qui la referme disparait avec elle.
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });
});
