import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Les pages légales ne promettent que ce que le produit fait.
 *
 * Sept marqueurs « à compléter » s'affichaient à des visiteurs sur des pages
 * publiques. Cinq d'entre eux n'attendaient aucune décision : ils demandaient
 * de décrire ce que la plateforme fait déjà, ce qui se lit dans le code et dans
 * la base. Ils ont été remplacés par les faits.
 *
 * Les deux qui subsistent portent l'identité juridique de l'éditeur : raison
 * sociale, forme, capital, registre du commerce, siège, et le nom du directeur
 * de la publication. Personne d'autre que le propriétaire ne peut les fournir,
 * et les inventer produirait un faux sur une page légale. Ce contrôle interdit
 * qu'ils se multiplient de nouveau.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const PAGE = fs.readFileSync(path.join(RACINE, "src/pages/legal/LegalPages.tsx"), "utf8");

describe("pages légales", () => {
  it("ne laisse que l'identité de l'éditeur à compléter", () => {
    const marqueurs = PAGE.match(/<AComplete>/g) ?? [];
    expect(
      marqueurs.length,
      "tout marqueur nouveau doit décrire un fait, pas attendre une décision"
    ).toBeLessThanOrEqual(2);

    const section = PAGE.slice(PAGE.indexOf("Éditeur :"), PAGE.indexOf("Hébergement"));
    expect((section.match(/<AComplete>/g) ?? []).length).toBe(marqueurs.length);
  });

  it("nomme l'hébergeur, qui est un fait vérifiable", () => {
    expect(PAGE).toContain("Cloudflare Pages");
    expect(PAGE).toContain("Supabase");
  });

  it("dit qu'aucun prestataire de paiement n'intervient", () => {
    // Tant que ce sera vrai, le taire laisserait croire le contraire.
    expect(PAGE).toMatch(/aucun prestataire de paiement/i);
    expect(PAGE).toMatch(/ne détient à aucun moment les fonds/i);
  });

  it("renvoie la suppression vers l'écran qui l'exerce, pas vers une adresse absente", () => {
    expect(PAGE).toMatch(/suppression s'exerce directement/i);
    expect(PAGE).toMatch(/onglet « Compte »/);
  });

  it("dit qu'aucune purge automatique n'existe, plutôt qu'une durée non appliquée", () => {
    expect(PAGE).toMatch(/aucune purge automatique/i);
  });
});
