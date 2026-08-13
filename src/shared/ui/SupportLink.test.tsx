import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupportLink } from "./SupportLink";

/** Fixe la configuration de support pour un cas de test donné. */
function configurer(courriel: string, adresse: string) {
  vi.stubEnv("VITE_SUPPORT_EMAIL", courriel);
  vi.stubEnv("VITE_SUPPORT_URL", adresse);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SupportLink", () => {
  it("n'affiche aucun lien tant qu'aucun canal n'est configuré", () => {
    configurer("", "");
    const { container } = render(<SupportLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ignore une adresse de courriel qui n'en est pas une", () => {
    configurer("a-completer", "");
    const { container } = render(<SupportLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("refuse une adresse qui n'est pas en https", () => {
    configurer("", "javascript:alert(1)");
    const { container } = render(<SupportLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ouvre un courriel quand l'adresse est renseignée", () => {
    configurer("support@exemple.test", "");
    render(<SupportLink />);

    expect(screen.getByRole("link", { name: /écrire au support/i })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:support@exemple.test")
    );
  });

  it("porte la référence d'incident dans le sujet du message", () => {
    configurer("support@exemple.test", "");
    render(<SupportLink reference="AKW-A3F7-K9DP" />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("AKW-A3F7-K9DP"))
    );
  });

  it("se rabat sur la page de contact quand seule celle-ci est configurée", () => {
    configurer("", "https://exemple.test/contact");
    render(<SupportLink />);

    expect(screen.getByRole("link", { name: /contacter le support/i })).toHaveAttribute(
      "href",
      "https://exemple.test/contact"
    );
  });

  it("accepte un libellé fourni par l'appelant", () => {
    configurer("support@exemple.test", "");
    render(<SupportLink>Signaler un problème</SupportLink>);

    expect(screen.getByRole("link", { name: "Signaler un problème" })).toBeInTheDocument();
  });
});
