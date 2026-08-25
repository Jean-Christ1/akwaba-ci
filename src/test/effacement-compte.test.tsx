import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DeleteAccountCard,
  MOT_DE_CONFIRMATION,
  confirmationValide,
} from "@/modules/account/ui/DeleteAccountCard";

/**
 * Le droit à l'effacement.
 *
 * La page de confidentialité promet au visiteur qu'il peut demander la
 * suppression de ses données. Aucun écran ne le permettait, et l'adresse de
 * contact censée recueillir la demande est encore un marqueur à compléter : le
 * droit était annoncé sans aucun moyen de l'exercer.
 */
describe("confirmation de suppression", () => {
  it("exige le mot, écrit", () => {
    expect(confirmationValide("")).toBe(false);
    expect(confirmationValide("oui")).toBe(false);
    expect(confirmationValide(MOT_DE_CONFIRMATION)).toBe(true);
  });

  it("ne piège personne sur une majuscule ou une espace", () => {
    // Le but est de s'assurer que la personne a lu et voulu, pas de la piéger.
    expect(confirmationValide(" supprimer ")).toBe(true);
    expect(confirmationValide("Supprimer")).toBe(true);
  });
});

describe("carte de suppression de compte", () => {
  it("dit ce qui part et ce qui reste, avant tout geste", () => {
    render(<DeleteAccountCard onDeleted={() => {}} />);

    const texte = document.body.textContent ?? "";
    expect(texte).toMatch(/portefeuille/i);
    // Ce qui survit doit être annoncé : les écritures comptables restent, sans
    // le nom. Le taire ferait croire à un effacement total.
    expect(texte).toMatch(/courses terminées restent/i);
    expect(texte).toMatch(/sans votre nom/i);
    expect(texte).toMatch(/ne se reprend pas/i);
  });

  it("ne supprime pas sur un simple clic", () => {
    render(<DeleteAccountCard onDeleted={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /supprimer mon compte/i }));
    const definitif = screen.getByRole("button", { name: /supprimer définitivement/i });
    expect(definitif).toBeDisabled();
  });

  it("n'ouvre le geste qu'une fois le mot écrit", () => {
    render(<DeleteAccountCard onDeleted={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /supprimer mon compte/i }));
    fireEvent.change(screen.getByLabelText(/écrivez/i), {
      target: { value: MOT_DE_CONFIRMATION },
    });

    expect(screen.getByRole("button", { name: /supprimer définitivement/i })).toBeEnabled();
  });
});
