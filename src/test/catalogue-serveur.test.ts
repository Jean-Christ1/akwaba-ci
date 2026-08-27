import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES } from "@/modules/errands/domain";

/**
 * Ce qu'Akwaba propose est décidé par la base, pas par le code livré.
 *
 * Le catalogue des types de course vivait dans une constante. Fermer le gaz le
 * temps d'une pénurie, ou le marché pendant des travaux, demandait alors une
 * livraison de l'application : personne ne le faisait, et la course partait
 * quand même vers un commerce fermé.
 *
 * Ce contrôle empêche le retour en arrière. Il ne suffit pas que l'écran
 * d'administration existe : tant qu'un écran client rend une liste écrite dans
 * le code, le réglage n'a aucun effet là où il compte, et l'exploitation croit
 * avoir fermé un service qui continue d'accepter des courses.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const lire = (relatif: string) => fs.readFileSync(path.join(RACINE, relatif), "utf8");

/** Les écrans où le client choisit ce qu'il demande. */
const ECRANS_DU_CHOIX = [
  "src/pages/courses/NewErrandPage.tsx",
  "src/pages/services/ServicesHubPage.tsx",
];

describe("le catalogue des services vient du serveur", () => {
  it("aucun écran de choix ne rend une liste écrite dans le code", () => {
    for (const chemin of ECRANS_DU_CHOIX) {
      const source = lire(chemin);
      expect(
        source.includes("CATEGORIES.map"),
        `${chemin} ne doit pas rendre le catalogue depuis une constante`
      ).toBe(false);
      expect(source, `${chemin} doit demander le catalogue au serveur`).toContain(
        "useServiceModes"
      );
    }
  });

  it("la constante restante ne sert plus qu'à nommer une course déjà passée", () => {
    // La constante garde une utilité : une course publiée dans une catégorie
    // depuis fermée doit continuer de s'afficher avec son nom, sur le tableau
    // du shopper comme dans l'historique. Ce qu'elle ne doit plus faire, c'est
    // décider de ce qu'on peut demander.
    const domaine = lire("src/modules/errands/domain.ts");
    expect(domaine).toContain("CATEGORIES");
    expect(CATEGORIES.length, "les libellés des courses passées restent nécessaires").toBeGreaterThan(0);
  });

  it("l'exploitation dispose d'un écran pour ouvrir et fermer un service", () => {
    // Retirer la constante sans donner le réglage à quelqu'un aurait rendu le
    // catalogue immuable : plus personne n'aurait pu fermer un service, ni par
    // le code, ni par l'écran.
    const reglages = lire("src/pages/admin/SettingsPage.tsx");
    expect(reglages).toContain("ServiceModesEditor");

    const editeur = lire("src/modules/admin/ServiceModesEditor.tsx");
    expect(editeur, "le réglage passe par la fonction serveur, qui vérifie le droit").toContain(
      "service_mode_regler"
    );
  });

  it("le formulaire ne propose que les règlements ouverts à la catégorie", () => {
    // Un retrait de colis n'a rien à acheter : lui proposer d'avancer de
    // l'argent ferait poser au client une question sans objet, et le serveur
    // refuserait la course à l'envoi.
    const formulaire = lire("src/pages/courses/NewErrandPage.tsx");
    expect(formulaire).toContain("reglementsOuverts");
  });
});
