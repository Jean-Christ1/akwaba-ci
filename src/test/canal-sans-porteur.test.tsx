import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationChannelCard } from "@/modules/account/ui/NotificationChannelCard";

/**
 * Un canal proposé sans porteur.
 *
 * L'écran offrait les quatre canaux avec la même assurance. Deux d'entre eux
 * n'ont aucun porteur : le courriel et le SMS. Quelqu'un qui choisissait le SMS
 * donnait son numéro, datait son consentement, et ne recevait plus rien, en
 * croyant simplement qu'on ne lui écrivait pas.
 *
 * La carte d'exploitation le dit maintenant, mais elle est réservée au
 * personnel. La personne concernée doit l'apprendre là où elle fait le choix.
 */

const PROFIL = {
  canal_prefere: "sms",
  whatsapp: "+225 07 00 00 00 01",
  whatsapp_consent_at: "2026-08-01T10:00:00Z",
  sms_consent_at: "2026-08-01T10:00:00Z",
};

function servir(portes: string[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    let corps: unknown = null;
    if (url.includes("canaux_portes")) corps = portes;
    else if (url.includes("/auth/v1/user")) {
      corps = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated" };
    } else if (url.includes("profiles")) corps = PROFIL;
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("un canal sans porteur", { timeout: 30_000 }, () => {
  it("dit sous chaque choix qu'il ne délivrerait rien", async () => {
    servir(["whatsapp", "in_app"]);
    render(<NotificationChannelCard telephone="0700000001" />);

    await waitFor(() => {
      // Le courriel et le SMS : deux mentions, pas une de plus.
      expect(screen.getAllByText(/Pas encore en service/)).toHaveLength(2);
    });
  });

  it("avertit quand le canal retenu est celui qui ne délivre pas", async () => {
    // Le canal retenu ici est WhatsApp, celui que l'ecran propose par defaut.
    // On le declare sans porteur : la personne doit l'apprendre a l'endroit ou
    // elle fait le choix, et non le decouvrir en ne recevant rien.
    servir(["in_app"]);
    render(<NotificationChannelCard telephone="0700000001" />);

    expect(
      await screen.findByText(/Le canal que vous avez choisi n'est pas encore en service/)
    ).toBeInTheDocument();
  });

  it("n'avertit de rien quand tout est en service", async () => {
    servir(["whatsapp", "sms", "email", "in_app"]);
    render(<NotificationChannelCard telephone="0700000001" />);

    await screen.findByText("Où vous joindre");
    expect(screen.queryByText(/Pas encore en service/)).toBeNull();
    expect(screen.queryByText(/n'est pas encore en service/)).toBeNull();
  });

  it("n'affirme rien tant que la réponse du serveur n'est pas là", async () => {
    // Afficher « pas en service » avant de savoir ferait clignoter un
    // avertissement faux a chaque ouverture de la page.
    vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
      const url = typeof entree === "string" ? entree : entree.toString();
      if (url.includes("canaux_portes")) return new Promise(() => {}) as never;
      const corps = url.includes("/auth/v1/user")
        ? { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated" }
        : PROFIL;
      return new Response(JSON.stringify(corps), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch);

    render(<NotificationChannelCard telephone="0700000001" />);
    await screen.findByText("Où vous joindre");
    expect(screen.queryByText(/Pas encore en service/)).toBeNull();
  });
});
