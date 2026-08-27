import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * L'accueil et la page Services ne doivent pas raconter la même chose.
 *
 * Les deux écrans disaient la même promesse, avec les mêmes deux boutons et
 * les mêmes cartes de catégorie. Un visiteur qui suivait le lien depuis
 * l'accueil avait l'impression de revenir sur ses pas, et ne savait plus lequel
 * des deux ouvrir la fois suivante.
 *
 * Chaque page répond désormais à une question différente. L'accueil dit
 * pourquoi utiliser Akwaba et propose un geste. La page Services dit quoi
 * exactement, combien cela coûte et ce qui protège. Ce contrôle empêche les
 * deux de reconverger.
 */

const RACINE = path.resolve(__dirname, "..", "..");

const lire = (relatif: string) => fs.readFileSync(path.join(RACINE, relatif), "utf8");

const ACCUEIL = lire("src/modules/errands/ui/ShopperSpotlight.tsx");
const PORTES = lire("src/modules/errands/ui/ServiceDoors.tsx");
const HUB = lire("src/pages/services/ServicesHubPage.tsx");

/** Ce que la page Services rend, portes comprises. */
const SERVICES = PORTES + HUB;

describe("l'accueil et la page Services ne se répètent pas", () => {
  it("le catalogue des catégories ne vit qu'à un seul endroit", () => {
    // Les cartes de catégorie sont le coeur de la page Services : les répéter
    // sur l'accueil affichait deux fois les mêmes liens vers les mêmes
    // formulaires préremplis.
    expect(
      ACCUEIL.includes("CATEGORIES"),
      "l'accueil ne doit pas rendre le catalogue : il appartient à /services"
    ).toBe(false);
    expect(HUB).toContain("CATEGORIES.map");
  });

  it("la promesse du service n'est écrite qu'une fois", () => {
    // Cette formule ouvrait les deux écrans, à quelques mots près.
    const promesse = /Vous d[ée]crivez ce qu'il vous faut/;
    expect(promesse.test(ACCUEIL), "l'accueil porte la promesse").toBe(true);
    expect(
      promesse.test(SERVICES),
      "la page Services ne doit pas redire la promesse de l'accueil"
    ).toBe(false);
  });

  it("l'énumération des lieux ne se répète pas d'un écran à l'autre", () => {
    // « marché, pharmacie, démarches » apparaissait trois fois : sur l'accueil,
    // dans l'en-tête du hub, et dans la porte client.
    const enumeration = /march[ée].{0,40}pharmacie/is;
    const occurrences = [ACCUEIL, PORTES, HUB].filter((source) => enumeration.test(source));
    expect(
      occurrences.length,
      "l'énumération des lieux ne doit apparaître que dans un seul de ces trois fichiers"
    ).toBeLessThanOrEqual(1);
  });

  it("les preuves faites au client ne sont pas listées deux fois", () => {
    // Le code de remise, le prix annoncé d'avance et la vérification du profil
    // étaient promis sur les deux écrans, dans les mêmes termes.
    const codeDeRemise = /code de remise/i;
    expect(codeDeRemise.test(ACCUEIL), "l'accueil porte les réassurances").toBe(true);
    expect(
      codeDeRemise.test(PORTES),
      "les portes du service ne doivent pas relister les preuves de l'accueil"
    ).toBe(false);
  });

  it("chaque écran garde son geste, car on peut y arriver directement", () => {
    // Retirer la répétition ne veut pas dire retirer l'action : quelqu'un qui
    // ouvre /services par la navigation doit pouvoir demander une course sans
    // repasser par l'accueil.
    for (const [nom, source] of [
      ["l'accueil", ACCUEIL],
      ["la page Services", SERVICES],
    ] as const) {
      expect(source, `${nom} doit mener à la demande de course`).toContain("/courses/nouvelle");
      expect(source, `${nom} doit mener à la candidature shopper`).toContain(
        "/courses/devenir-shopper"
      );
    }
  });

  it("le lien de l'accueil vers Services annonce ce qu'on y trouve de neuf", () => {
    // « Tous les services Akwaba » ne promettait rien que le visiteur n'ait
    // déjà lu, et le clic ressemblait à un retour en arrière.
    expect(ACCUEIL).toContain("/services");
    expect(ACCUEIL).not.toMatch(/Tous les services Akwaba/);
    expect(ACCUEIL).toMatch(/catalogue|tarifs|protections/i);
  });
});
