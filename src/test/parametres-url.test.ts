import { describe, expect, it } from "vitest";

import { CATEGORIES, resoudreCategorie } from "@/modules/errands/domain";

/**
 * Ce qui entre par l'URL n'est pas une donnée de confiance.
 *
 * Le hub des services, la fiche d'un lieu et les liens partagés ouvrent tous
 * le formulaire de demande avec une catégorie déjà choisie. Une valeur inconnue
 * traversait jusqu'ici le formulaire sans contrôle, puis heurtait l'énumération
 * Postgres au moment de publier : le client perdait sa saisie sur un message
 * technique. La résolution doit donc ramener au catalogue, toujours.
 */
describe("catégorie venue d'une URL", () => {
  it("garde chaque catégorie réellement au catalogue", () => {
    for (const categorie of CATEGORIES) {
      expect(resoudreCategorie(categorie.value)).toBe(categorie.value);
    }
  });

  it("ramène au supermarché tout ce qui n'existe pas", () => {
    for (const valeur of [
      null,
      undefined,
      "",
      "inconnue",
      "GROCERY",
      "artisan ",
      "'; drop table errands; --",
    ]) {
      expect(resoudreCategorie(valeur), `« ${String(valeur)} » ne doit pas passer`).toBe(
        "grocery"
      );
    }
  });

  it("ne renvoie jamais autre chose qu'une valeur du catalogue", () => {
    const valeurs = CATEGORIES.map((c) => c.value);
    for (const entree of ["market", "n'importe quoi", null]) {
      expect(valeurs).toContain(resoudreCategorie(entree));
    }
  });
});
