import { describe, expect, it } from "vitest";

import { normaliserCode } from "@/modules/errands/ui/PromoCodeField";

/**
 * Le code saisi doit être celui que la base accepte.
 *
 * La contrainte n'admet que des majuscules, des chiffres et des tirets.
 * Quelqu'un qui tape son code en minuscules, ou qui le colle avec un espace,
 * doit voir son code marcher, pas un refus qu'il ne s'explique pas.
 */
describe("normalisation d'un code promotionnel", () => {
  const ACCEPTE_PAR_LA_BASE = /^[A-Z0-9-]{3,24}$/;

  it("met en majuscules et retire les espaces", () => {
    expect(normaliserCode("premiere-course")).toBe("PREMIERE-COURSE");
    expect(normaliserCode("  PREMIERE-COURSE  ")).toBe("PREMIERE-COURSE");
    expect(normaliserCode("PREMIERE COURSE")).toBe("PREMIERECOURSE");
  });

  it("produit un code que la base accepte", () => {
    for (const saisie of ["bienvenue2026", "  abj-10  ", "Noel-2026"]) {
      expect(normaliserCode(saisie)).toMatch(ACCEPTE_PAR_LA_BASE);
    }
  });

  it("ne fabrique pas un code valide à partir de rien", () => {
    // Une chaîne vide ou trop courte doit rester refusée : la corriger
    // silencieusement inventerait un code que personne n'a distribué.
    expect(normaliserCode("")).not.toMatch(ACCEPTE_PAR_LA_BASE);
    expect(normaliserCode("ab")).not.toMatch(ACCEPTE_PAR_LA_BASE);
  });
});
