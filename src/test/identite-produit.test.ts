import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Cohérence de l'identité annoncée.
 *
 * L'accueil dit maintenant que le service principal est la course faite pour
 * vous, mais le titre de la page, les métadonnées de partage et le nom
 * installé sur l'écran d'accueil annonçaient encore un guide de voyage. Un
 * visiteur arrivant par un lien partagé lisait donc une promesse, et la page
 * lui en montrait une autre.
 *
 * Ces contrôles ne jugent pas la formulation, ils vérifient qu'elle parle bien
 * du service et qu'aucune trace de l'ancienne promesse ne subsiste.
 */

const RACINE = path.resolve(__dirname, "../..");
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

describe("identité annoncée", () => {
  it("le titre de la page parle du service, pas d'un guide de voyage", () => {
    const html = lire("index.html");
    const titre = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";

    expect(titre).toMatch(/course/i);
    expect(titre).not.toMatch(/compagnon de voyage/i);
  });

  it("les métadonnées de partage disent la même chose que la page", () => {
    const html = lire("index.html");

    // Un lien partagé sur WhatsApp affiche ces valeurs : elles sont souvent la
    // toute première chose qu'un futur client lit d'Akwaba.
    for (const propriete of ["og:title", "twitter:title"]) {
      const valeur =
        html.match(new RegExp(`(?:property|name)="${propriete}" content="([^"]+)"`))?.[1] ?? "";
      expect(valeur, `${propriete} doit parler du service`).toMatch(/course/i);
      expect(valeur, `${propriete} ne doit plus annoncer un guide`).not.toMatch(
        /compagnon de voyage/i
      );
    }
  });

  it("le nom installé sur l'écran d'accueil reste court et parle du service", () => {
    const manifeste = JSON.parse(lire("public/manifest.webmanifest"));

    expect(manifeste.name).toMatch(/course/i);
    // Au delà d'une trentaine de caractères, le lanceur tronque : un nom
    // coupé au milieu d'un mot dessert plus qu'il ne sert.
    expect(manifeste.short_name.length).toBeLessThanOrEqual(12);
    expect(manifeste.description).toMatch(/shopper/i);
  });

  it("aucun écran ne présente encore Akwaba comme un simple guide", () => {
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
        const rel = `${dossier}/${e.name}`;
        if (e.isDirectory()) parcourir(rel);
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
          if (/compagnon de voyage/i.test(lire(rel))) fautifs.push(rel);
        }
      }
    };
    parcourir("src");

    expect(fautifs, `ces écrans annoncent encore un guide de voyage : ${fautifs.join(", ")}`).toEqual(
      []
    );
  });
});
