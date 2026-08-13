import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  QUARTIERS_DE_SECOURS,
  VILLES_DE_SECOURS,
} from "./domain/service-areas-fallback";

/**
 * Le référentiel de secours des zones de service.
 *
 * Villes et quartiers viennent de la base, ce qui permet d'ouvrir une ville
 * sans livrer de code. Mais la panne s'est réellement produite : les tables
 * n'existaient pas encore, la lecture renvoyait une erreur, et le formulaire
 * de commande se retrouvait sans aucune ville. Un client ne pouvait plus
 * commander du tout, ce qui est pire qu'un référentiel figé.
 *
 * Ces tests garantissent que le filet existe et qu'il reste cohérent avec les
 * migrations dont il est la copie.
 */

const RACINE = path.resolve(__dirname, "../../..");
const MIGRATIONS = path.join(RACINE, "supabase/migrations");

describe("référentiel de secours des zones de service", () => {
  it("n'est jamais vide", () => {
    expect(VILLES_DE_SECOURS.length).toBeGreaterThan(0);
    expect(QUARTIERS_DE_SECOURS.length).toBeGreaterThan(0);
  });

  it("couvre les villes réellement ouvertes aux courses", () => {
    const ouvertes = VILLES_DE_SECOURS.filter((v) => v.errandsEnabled);
    expect(ouvertes.length).toBeGreaterThan(0);
    // Abidjan concentre l'essentiel de l'activité : son absence rendrait le
    // service inutilisable pour la majorité des clients.
    expect(VILLES_DE_SECOURS.map((v) => v.slug)).toContain("abidjan");
  });

  it("donne des quartiers à chaque ville ouverte aux courses", () => {
    for (const ville of VILLES_DE_SECOURS.filter((v) => v.errandsEnabled)) {
      const quartiers = QUARTIERS_DE_SECOURS.filter((z) => z.citySlug === ville.slug);
      expect(quartiers.length, `aucun quartier pour ${ville.name}`).toBeGreaterThan(0);
    }
  });

  it("porte des coordonnées plausibles pour la Côte d'Ivoire", () => {
    for (const v of VILLES_DE_SECOURS) {
      expect(v.lat, `latitude de ${v.name}`).toBeGreaterThan(4);
      expect(v.lat, `latitude de ${v.name}`).toBeLessThan(11);
      expect(v.lng, `longitude de ${v.name}`).toBeGreaterThan(-9);
      expect(v.lng, `longitude de ${v.name}`).toBeLessThan(-2);
    }
  });

  it("rattache les quartiers d'Abidjan à une commune", () => {
    const abidjan = QUARTIERS_DE_SECOURS.filter((z) => z.citySlug === "abidjan");
    expect(abidjan.length).toBeGreaterThan(20);
    // Sans commune de rattachement, la liste des quartiers d'Abidjan est
    // ingérable à l'écran : c'est ce découpage qui la rend lisible.
    const rattaches = abidjan.filter((z) => z.parentName !== null);
    expect(rattaches.length).toBe(abidjan.length);
  });

  it("ne contient aucun doublon", () => {
    const villes = VILLES_DE_SECOURS.map((v) => v.slug);
    expect(new Set(villes).size).toBe(villes.length);

    const quartiers = QUARTIERS_DE_SECOURS.map((z) => `${z.citySlug}/${z.name}`);
    expect(new Set(quartiers).size).toBe(quartiers.length);
  });

  it("reste aligné sur les villes déclarées par les migrations", () => {
    const fichier = fs
      .readdirSync(MIGRATIONS)
      .find((f) => f.startsWith("20260813140000"));
    expect(fichier, "la migration des villes est introuvable").toBeTruthy();

    const sql = fs.readFileSync(path.join(MIGRATIONS, fichier as string), "utf8");
    // Chaque ville du secours doit exister dans la migration : si l'une
    // disparaît en base, le secours la ressusciterait silencieusement.
    for (const v of VILLES_DE_SECOURS) {
      expect(sql, `${v.slug} absent de la migration`).toContain(`'${v.slug}'`);
    }
  });
});
