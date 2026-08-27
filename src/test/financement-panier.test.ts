import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validationRequise } from "@/modules/errands/ui/BasketApproval";

/**
 * La validation du panier ne s'impose que là où elle protège.
 *
 * Elle protège le shopper qui avance ses propres fonds : sans accord préalable,
 * le client peut refuser à l'arrivée, et en Côte d'Ivoire la marchandise ne se
 * rend pas. Dans les autres modes, l'argent est déjà chez le shopper ou n'a pas
 * encore quitté le client : imposer une étape de plus ralentirait sans rien
 * protéger.
 */
describe("quand le panier doit être validé", () => {
  it("s'impose quand le shopper avance ses propres fonds", () => {
    expect(validationRequise("runner_advance")).toBe(true);
  });

  it("ne s'impose pas quand le client a déjà envoyé l'argent", () => {
    expect(validationRequise("customer_advance")).toBe(false);
  });

  it("ne s'impose pas quand tout se règle à la livraison", () => {
    expect(validationRequise("on_delivery")).toBe(false);
  });

  it("ne s'impose pas sur un mode inconnu, plutôt que de bloquer la course", () => {
    // Fermer par défaut arrêterait un parcours entier sur une valeur qu'on
    // n'avait pas prévue. Le serveur, lui, garde sa propre garde.
    expect(validationRequise("")).toBe(false);
  });
});

/**
 * Le plafond d'avance annoncé au client doit être celui que le serveur
 * applique.
 *
 * Il ne l'était pas : le produit affichait « plafond 50 000 FCFA » à partir
 * d'une constante TypeScript, alors qu'aucune fonction serveur ne vérifiait
 * quoi que ce soit. Le plafond suit désormais le palier de confiance du
 * shopper, en base, et l'écran ne doit plus prétendre le connaître seul.
 */
const RACINE = path.resolve(__dirname, "..", "..");

describe("le plafond d'avance vient du serveur", () => {
  it("la migration des paliers existe et porte les trois échelons", () => {
    const migration = fs.readFileSync(
      path.join(RACINE, "supabase/migrations/20260827200000_exposition_graduee.sql"),
      "utf8"
    );
    for (const palier of ["debutant", "confirme", "etabli"]) {
      expect(migration, `le palier ${palier} doit exister`).toContain(`'${palier}'`);
    }
    expect(migration).toContain("runner_advance_ceiling");
  });

  it("le serveur refuse une avance au-delà du palier", () => {
    const migration = fs.readFileSync(
      path.join(RACINE, "supabase/migrations/20260827230000_plafond_avance_sans_surcharge.sql"),
      "utf8"
    );
    expect(migration).toMatch(/peut recevoir au plus/);
    // La garde d'origine ne doit pas avoir été perdue en chemin : une avance
    // déjà reconnue par le shopper ne peut pas être réduite.
    expect(migration).toMatch(/ne peut pas être réduite/);
  });

  it("la facture exige un panier validé quand le shopper avance", () => {
    const migration = fs.readFileSync(
      path.join(RACINE, "supabase/migrations/20260827220000_gardes_du_financement.sql"),
      "utf8"
    );
    expect(migration).toMatch(/Faites valider le panier/);
    expect(migration).toMatch(/dépasse le panier validé/);
    expect(migration).toMatch(/Ouvrez un litige plutôt qu''une annulation/);
  });
});
