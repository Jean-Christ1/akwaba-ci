import { describe, expect, it } from "vitest";

/**
 * Le centre d'aide ne doit décrire que ce qui existe.
 *
 * Une réponse qui promet une fonctionnalité absente fabrique des réclamations
 * au lieu de les éviter. Ce contrôle lit le contenu déposé en base par la
 * migration et refuse les promesses que le produit ne tient pas.
 */
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(__dirname, "..", "..");
const CONTENU = fs.readFileSync(
  path.join(RACINE, "supabase/migrations/20260827150000_centre_aide_contenu.sql"),
  "utf8"
);

describe("centre d'aide", () => {
  it("dit qu'aucun prestataire de paiement ne détient les fonds", () => {
    // Tant que c'est vrai, le taire laisserait croire le contraire à quelqu'un
    // qui cherche justement à savoir où va son argent.
    expect(CONTENU).toMatch(/ne détient à aucun moment les fonds/i);
    expect(CONTENU).toMatch(/aucun prestataire de paiement n''intervient/i);
  });

  it("ne promet aucun remboursement que la plateforme ne peut pas faire", () => {
    expect(CONTENU).toMatch(/la plateforme ne rembourse pas elle-même/i);
  });

  it("dit la règle de majorité telle que le serveur l'applique", () => {
    expect(CONTENU).toMatch(/dix-huit ans révolus/i);
    expect(CONTENU).toMatch(/refuse le dossier au dépôt/i);
  });

  it("ne prétend à aucune analyse biométrique", () => {
    // Aucun prestataire n'est contractualisé. Annoncer une reconnaissance
    // faciale automatique serait une garantie fausse.
    expect(CONTENU).toMatch(/aucune analyse automatique de votre visage/i);
    expect(CONTENU).not.toMatch(/reconnaissance faciale/i);
  });

  it("ne garantit jamais l'absence totale de fraude", () => {
    expect(CONTENU).toMatch(/aucun infaillible/i);
    expect(CONTENU).not.toMatch(/z[ée]ro fraude|100 ?% s[ûu]r|totalement s[ée]curis/i);
  });

  it("couvre les deux côtés du service", () => {
    for (const audience of ["'client'", "'shopper'", "'tous'"]) {
      expect(CONTENU).toContain(audience);
    }
  });

  it("renvoie vers des routes qui existent", () => {
    const app = fs.readFileSync(path.join(RACINE, "src/App.tsx"), "utf8");
    const liens = [...CONTENU.matchAll(/^'(\/[a-z0-9/-]+)', '/gm)].map((m) => m[1]);
    const cites = [...CONTENU.matchAll(/ '(\/[a-z0-9/-]+)', '[A-ZÀ-ÿ]/g)].map((m) => m[1]);
    const tous = [...new Set([...liens, ...cites])];
    expect(tous.length).toBeGreaterThan(0);
    for (const lien of tous) {
      // Une réponse qui envoie vers une page inexistante est pire qu'une
      // réponse sans lien : elle donne une impasse pour solution.
      expect(app, `${lien} n'est pas une route déclarée`).toContain(`path="${lien}"`);
    }
  });
});
