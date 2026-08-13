import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function ComposantQuiEchoue(): JSX.Element {
  throw new Error("panne de rendu simulée");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React signale l'erreur interceptée sur la console : on la fait taire pour
    // que la sortie des tests reste lisible.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("laisse passer le contenu quand tout va bien", () => {
    render(
      <ErrorBoundary>
        <p>Contenu normal</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("Contenu normal")).toBeInTheDocument();
  });

  it("remplace l'écran blanc par un message compréhensible", () => {
    render(
      <ErrorBoundary>
        <ComposantQuiEchoue />
      </ErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: /une erreur est survenue/i })).toBeInTheDocument();
  });

  it("propose toujours deux issues à l'utilisateur", () => {
    render(
      <ErrorBoundary>
        <ComposantQuiEchoue />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retour à l'accueil/i })).toBeInTheDocument();
  });

  it("consigne l'erreur pour le diagnostic", () => {
    render(
      <ErrorBoundary>
        <ComposantQuiEchoue />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });
});
