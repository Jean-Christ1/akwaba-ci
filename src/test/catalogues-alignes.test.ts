import { describe, expect, it } from "vitest";

import { Constants } from "@/integrations/supabase/types";
import { CATEGORIES, PAY_METHODS } from "@/modules/errands/domain";
import { DROPOFF_MODES, FUND_MODES, VEHICLE_OPTIONS } from "@/modules/errands/pricing";

/**
 * Les listes proposées au client doivent être exactement celles que la base
 * accepte.
 *
 * Une catégorie ajoutée à l'écran mais absente de l'énumération Postgres fait
 * échouer la demande au moment de publier, après que le client a tout saisi.
 * Une valeur ajoutée en base mais oubliée à l'écran est un service ouvert que
 * personne ne peut demander. Les deux dérives sont silencieuses : le code
 * compile, les écrans s'affichent.
 *
 * Les valeurs de référence viennent des types générés depuis la base, donc de
 * la base elle-même, et non d'une liste recopiée à la main.
 */
const ENUMS = Constants.public.Enums;

function memesValeurs(catalogue: readonly { value: string }[], attendu: readonly string[]) {
  return {
    catalogue: [...catalogue.map((c) => c.value)].sort(),
    base: [...attendu].sort(),
  };
}

describe("catalogues du front et énumérations de la base", () => {
  it("propose exactement les catégories de course que la base accepte", () => {
    const { catalogue, base } = memesValeurs(CATEGORIES, ENUMS.errand_category);
    expect(catalogue).toEqual(base);
  });

  it("propose exactement les moyens de paiement que la base accepte", () => {
    const { catalogue, base } = memesValeurs(PAY_METHODS, ENUMS.pay_method);
    expect(catalogue).toEqual(base);
  });

  it("propose exactement les modes de financement que la base accepte", () => {
    const { catalogue, base } = memesValeurs(FUND_MODES, ENUMS.fund_mode);
    expect(catalogue).toEqual(base);
  });

  it("propose exactement les modes de remise que la base accepte", () => {
    const { catalogue, base } = memesValeurs(DROPOFF_MODES, ENUMS.dropoff_mode);
    expect(catalogue).toEqual(base);
  });

  it("donne un libellé et une aide à chaque entrée, sans quoi la liste est illisible", () => {
    for (const catalogue of [CATEGORIES, FUND_MODES, DROPOFF_MODES, VEHICLE_OPTIONS]) {
      for (const entree of catalogue) {
        expect(entree.label.trim().length, `libellé manquant sur « ${entree.value} »`).toBeGreaterThan(0);
        const aide = "hint" in entree ? entree.hint : "";
        expect(aide.trim().length, `aide manquante sur « ${entree.value} »`).toBeGreaterThan(0);
      }
    }
  });
});
