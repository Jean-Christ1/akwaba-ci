import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "./OfflineBanner";

function simulerConnexion(enLigne: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(enLigne);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("reste invisible tant que la connexion tient", () => {
    simulerConnexion(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("prévient quand la connexion est perdue au chargement", () => {
    simulerConnexion(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/connexion perdue/i);
  });

  it("réagit à une coupure survenant en cours d'utilisation", () => {
    simulerConnexion(true);
    render(<OfflineBanner />);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("annonce le message aux lecteurs d'écran sans interrompre", () => {
    simulerConnexion(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
