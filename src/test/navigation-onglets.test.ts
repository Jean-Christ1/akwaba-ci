import { describe, expect, it } from "vitest";

import { ongletActif } from "@/shared/ui/MobileTabBar";

/**
 * Un seul onglet allumé à la fois.
 *
 * La barre allumait « Demander » et « Mes courses » ensemble dès qu'on ouvrait
 * le formulaire, parce que les deux chemins partagent un préfixe et que la
 * comparaison se faisait par simple début de chaîne. Deux onglets actifs ne
 * disent plus où l'on est : ils disent qu'on est partout.
 */
const CHEMINS = ["/", "/explorer", "/courses/nouvelle", "/courses", "/profil"] as const;

describe("onglet actif de la barre mobile", () => {
  it("allume le chemin le plus précis, jamais les deux", () => {
    expect(ongletActif("/courses/nouvelle", CHEMINS)).toBe("/courses/nouvelle");
    expect(ongletActif("/courses", CHEMINS)).toBe("/courses");
  });

  it("rattache une course ouverte au suivi, pas à la demande", () => {
    // /courses/abc est la fiche d'une course : elle appartient au suivi.
    expect(ongletActif("/courses/abc-123", CHEMINS)).toBe("/courses");
  });

  it("n'allume l'accueil que sur l'accueil", () => {
    expect(ongletActif("/", CHEMINS)).toBe("/");
    expect(ongletActif("/explorer", CHEMINS)).toBe("/explorer");
    expect(ongletActif("/profil", CHEMINS)).toBe("/profil");
  });

  it("n'allume rien sur une page hors de la barre", () => {
    // La page Services et le centre d'aide ne sont pas des onglets : mentir
    // en allumant le plus proche indiquerait une position fausse.
    expect(ongletActif("/services", CHEMINS)).toBe(null);
    expect(ongletActif("/aide", CHEMINS)).toBe(null);
  });

  it("ne confond pas un chemin qui commence pareil sans être dedans", () => {
    // « /coursesXYZ » n'est pas sous « /courses ».
    expect(ongletActif("/coursesXYZ", CHEMINS)).toBe(null);
  });
});
