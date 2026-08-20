import fs from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RunnerCard } from "@/modules/errands/application/useErrandDetail";
import { RunnerContactCard } from "@/modules/errands/ui/RunnerContactCard";

/**
 * Accessibilité des commandes et taille des cibles tactiles.
 *
 * Deux défauts constatés sur des écrans publics, et vérifiés ici.
 *
 * Le premier rendait la carte inutilisable sans la vue : chaque repère était un
 * bouton créé hors React, sans type, sans libellé et sans texte, si bien qu'un
 * parcours au clavier ou au lecteur d'écran rencontrait autant de contrôles
 * annoncés « bouton », tous identiques, qu'il y a d'adresses publiées. La page
 * n'avait par ailleurs aucun titre de niveau 1, ce qui la privait du seul
 * repère de navigation par titres.
 *
 * Le second est une affaire de pouce : plusieurs commandes tombaient sous les
 * 44 px que le dépôt s'impose ailleurs, précisément là où l'écran est le plus
 * petit, les puces de filtre de la feuille mobile, les onglets de la fiche
 * lieu, et les trois moyens de joindre le shopper pendant une mission.
 */

const RACINE = path.resolve(__dirname, "../..");
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

/** Seuil tactile du dépôt, écrit tel qu'il apparaît en classe utilitaire. */
const SEUIL_TACTILE = "min-h-[44px]";

afterEach(cleanup);

describe("repères de la carte", () => {
  const carte = lire("src/pages/MapPage.tsx");

  /**
   * Le repère est construit à la main dans un effet, hors du gabarit JSX : on
   * isole cette portion pour ne pas confondre son libellé avec les aria-label
   * des commandes voisines, qui existaient déjà.
   */
  const blocRepere = () => {
    const debut = carte.indexOf("places.forEach((p) => {");
    expect(debut, "la boucle de création des repères est introuvable").toBeGreaterThan(-1);
    const fin = carte.indexOf("new Marker(", debut);
    expect(fin, "la pose du repère sur la carte est introuvable").toBeGreaterThan(debut);
    return carte.slice(debut, fin);
  };

  it("chaque repère porte un nom accessible tiré du lieu", () => {
    const bloc = blocRepere();
    expect(bloc).toContain('setAttribute("aria-label"');
    // Un libellé constant ferait pire que mieux : tous les repères
    // s'annonceraient de la même façon. Le nom doit venir de la donnée du lieu.
    expect(bloc).toContain("p.name");
  });

  it("chaque repère est un bouton déclaré", () => {
    // document.createElement("button") produit un bouton de type submit : hors
    // formulaire c'est sans effet visible, mais le type explicite est ce qui
    // documente l'intention et protège d'une insertion future dans un
    // formulaire.
    expect(blocRepere()).toContain('el.type = "button"');
  });

  it("l'épingle injectée ne concurrence pas le nom du repère", () => {
    expect(blocRepere()).toContain('<svg aria-hidden="true"');
  });

  it("la carte annonce un titre de niveau 1", () => {
    // Masqué à l'œil, la carte occupant toute la surface, mais lu par les
    // lecteurs d'écran : c'est la classe déjà employée ailleurs dans le dépôt.
    expect(carte).toMatch(/<h1 className="sr-only">/);
  });
});

describe("puces de filtre de la feuille mobile", () => {
  const explorer = lire("src/pages/ExplorerPage.tsx");

  it("les puces de catégorie atteignent le seuil tactile", () => {
    const debutFeuille = explorer.indexOf("<SheetContent");
    expect(debutFeuille, "la feuille de filtres est introuvable").toBeGreaterThan(-1);
    const feuille = explorer.slice(debutFeuille, explorer.indexOf("</SheetContent>", debutFeuille));

    const debutPuces = feuille.indexOf("TYPES.map(");
    expect(debutPuces, "les puces de catégorie sont introuvables").toBeGreaterThan(-1);
    const puces = feuille.slice(debutPuces, feuille.indexOf("</button>", debutPuces));

    expect(puces).toContain(SEUIL_TACTILE);
    // Ces deux surcharges étaient la cause : elles ramenaient la puce à environ
    // 26 px de haut, alors que la barre de puces de bureau, masquée sous sm,
    // laisse ces commandes seules au téléphone.
    expect(puces).not.toContain("!py-1");
    expect(puces).not.toContain("!text-xs");
  });
});

describe("onglets de la fiche lieu", () => {
  const fiche = lire("src/pages/PlaceDetailPage.tsx");
  const onglets = fiche.match(/<TabsTrigger[^>]*>/g) ?? [];

  it("la fiche déclare bien ses onglets", () => {
    expect(onglets.length).toBeGreaterThanOrEqual(5);
  });

  it("aucun onglet ne reste sous le seuil tactile", () => {
    // h-7 valait 28 px, sur l'écran le plus consulté au pouce.
    const fautifs = onglets.filter((o) => !o.includes(SEUIL_TACTILE));
    expect(fautifs, `onglets sous le seuil : ${fautifs.join(" ")}`).toHaveLength(0);
  });

  it("la barre d'onglets ne rogne pas la hauteur des cibles", () => {
    const barre = fiche.match(/<TabsList[^>]*>/)?.[0] ?? "";
    // La classe de base du composant partagé vaut h-10, soit 40 px. Exiger
    // seulement l'absence de h-9 ne gardait donc rien : retirer h-auto de la
    // page suffisait à rogner de nouveau les onglets portés à 44 px, et le
    // débordement vertical revenait, sans qu'aucun contrôle ne rougisse.
    expect(barre, "la hauteur de base doit être neutralisée").toMatch(
      /\bh-auto\b|\bmin-h-\[44px\]\b/
    );
    expect(barre).not.toMatch(/\bh-9\b|\bh-10\b/);
    expect(barre).toContain("overflow-x-auto");
  });
});

describe("contact du shopper pendant une mission", () => {
  const shopper: RunnerCard = {
    user_id: "b3f0c0d2-7c41-4a9e-9d1f-2f5a6c8e0a11",
    full_name: "Konan Yao",
    phone: "+2250701020304",
    whatsapp: "+2250701020304",
    city: "Abidjan",
    vehicle: "Moto",
    rating: 4.8,
    jobs_completed: 132,
  };

  const afficher = (runner: RunnerCard) =>
    render(
      <RunnerContactCard
        runner={runner}
        errandTitle="Courses au marché de Cocody"
        videoUrl="https://visio.akwaba.ci/course-2f5a6c8e"
      />
    );

  it("les trois moyens de joindre le shopper atteignent le seuil tactile", () => {
    afficher(shopper);

    // Ces commandes servent en marchant, d'une seule main, et ne portent aucun
    // libellé visible : à 36 px, rien ne rattrapait un appui manqué.
    const commandes = [
      screen.getByRole("link", { name: /Appeler/ }),
      screen.getByRole("link", { name: /WhatsApp/ }),
      screen.getByRole("link", { name: /visioconférence/ }),
    ];

    for (const commande of commandes) {
      expect(commande.className, commande.getAttribute("aria-label") ?? "").toContain(
        SEUIL_TACTILE
      );
    }
  });

  it("les commandes indisponibles gardent la même emprise", () => {
    // Sans coordonnées, le bouton reste affiché pour ne pas déplacer les
    // autres : sa taille doit suivre la même règle.
    afficher({ ...shopper, phone: null, whatsapp: null });

    const indisponibles = [
      screen.getByRole("button", { name: /téléphone indisponible/ }),
      screen.getByRole("button", { name: /WhatsApp indisponible/ }),
    ];

    for (const commande of indisponibles) {
      expect(commande.className).toContain(SEUIL_TACTILE);
    }
  });
});
