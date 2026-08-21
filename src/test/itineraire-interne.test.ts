import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Garde-fou produit : l'itinéraire se consulte DANS Akwaba.
 *
 * Renvoyer un visiteur vers Google Maps ou Waze, c'est le perdre : il quitte la
 * fiche, la réservation en cours et le service de courses. La navigation
 * externe reste légitime, mais seulement en recours, jamais comme geste
 * principal d'un écran.
 *
 * Ce que ce contrôle tolère, et pourquoi :
 *   - Le panneau d'itinéraire intégré (RoutePanel) propose Google Maps, Waze et
 *     Apple Plans dans un bloc « Ouvrir dans une autre application ». C'est le
 *     recours prévu quand le calcul échoue ou que la localisation est refusée.
 *     Ce fichier est donc le SEUL autorisé à citer un service de cartographie,
 *     et le contrôle vérifie en plus que ces liens gardent une apparence
 *     secondaire (bordure discrète, jamais le fond de la couleur principale).
 *
 * Ce que ce contrôle refuse :
 *   - Toute autre page ou composant qui cite un service de cartographie externe.
 *     Un écran qui recommence à envoyer dehors fait échouer ce test.
 */

const RACINE = path.resolve(__dirname, "../..");
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

/** Seul fichier autorisé à citer une application de navigation externe. */
const FICHIER_DE_SECOURS = "src/shared/ui/RoutePanel.tsx";

/** Hôtes de cartographie externes recherchés dans le code applicatif. */
const SERVICES_EXTERNES = /google\.[a-z.]+\/maps|maps\.google|waze\.com|maps\.apple\.com/i;

const listerFichiers = (dir: string): string[] => {
  const sortie: string[] = [];
  for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sortie.push(...listerFichiers(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) sortie.push(rel);
  }
  return sortie;
};

describe("itinéraire intégré à l'application", () => {
  it("aucun écran n'envoie vers un service de cartographie externe", () => {
    const fautifs = listerFichiers("src")
      .filter((f) => f !== FICHIER_DE_SECOURS)
      .filter((f) => SERVICES_EXTERNES.test(lire(f)));

    expect(
      fautifs,
      `Ces fichiers renvoient l'utilisateur hors de l'application. Utilisez RouteDialog ou RoutePanel : ${fautifs.join(", ")}`
    ).toEqual([]);
  });

  it("les applications externes restent une action secondaire du panneau", () => {
    const panneau = lire(FICHIER_DE_SECOURS);
    expect(panneau).toContain("Ouvrir dans une autre application");

    // Apparence des liens de secours : on isole le gabarit de l'ancre rendue
    // pour chaque application externe et on vérifie qu'il n'emprunte pas
    // l'habillage réservé à l'action principale.
    const debut = panneau.indexOf("{externalLinks.map(");
    expect(debut, "le bloc des applications externes est introuvable").toBeGreaterThan(-1);
    const bloc = panneau.slice(debut, panneau.indexOf("</a>", debut));
    expect(bloc).toContain("border-border");
    expect(bloc).not.toMatch(/bg-primary|bg-accent\b|text-primary-foreground/);
    // L'ouverture externe doit être annoncée, y compris aux lecteurs d'écran.
    expect(bloc).toContain('target="_blank"');
    expect(bloc).toContain("ouverture dans une application externe");
  });

  it("les écrans qui proposent un itinéraire utilisent la vue intégrée", () => {
    const ecrans = [
      "src/pages/PlaceDetailPage.tsx",
      "src/pages/MapPage.tsx",
      "src/pages/ItineraryPages.tsx",
    ];

    // La page autonome /itineraire a été retirée : elle faisait sortir de
    // l'écran en cours et aucun lien ne l'ouvrait. Sa réapparition ferait
    // échouer le contrôle de route orpheline, dans santé structurelle.
    expect(fs.existsSync(path.join(RACINE, "src/pages/RoutePage.tsx"))).toBe(false);
    for (const ecran of ecrans) {
      const code = lire(ecran);
      expect(code, `${ecran} doit ouvrir l'itinéraire dans l'application`).toMatch(
        /RouteDialog|RoutePanel/
      );
    }
  });

  it("le panneau reste utile quand le calcul échoue ou que la position est refusée", () => {
    const panneau = lire(FICHIER_DE_SECOURS);
    // Un utilisateur bloqué sans issue est un utilisateur perdu : il doit
    // toujours pouvoir relancer le calcul, redemander sa position, ou basculer
    // vers une application de navigation.
    expect(panneau).toContain("Réessayer");
    expect(panneau).toContain("Me localiser");
    expect(panneau).toContain('routeState === "error"');
    expect(panneau).toContain('positionState === "refused"');
    // La carte n'est pas descriptible : la distance, la durée et l'état du
    // calcul doivent exister en texte pour un lecteur d'écran.
    expect(panneau).toContain('role="status"');
    expect(panneau).toContain('aria-live="polite"');
  });
});
