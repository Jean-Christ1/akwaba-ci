import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Garde-fou sur la lecture de la table errands.
 *
 * Cette table est la seule dont la lecture est accordée colonne par colonne,
 * parce qu'elle porte le code de remise, qui doit rester invisible au shopper.
 * Ce choix a un prix : toute colonne ajoutée ensuite reste illisible tant que
 * les privilèges ne sont pas rafraîchis, et tout select étoile échoue puisqu'il
 * demande aussi la colonne interdite.
 *
 * Le défaut s'est réellement produit : dix-huit colonnes ont été ajoutées après
 * la pose des privilèges sans jamais être accordées, et l'écran de détail d'une
 * course en sélectionnait quatre. Ces deux tests interdisent la récidive.
 */

const RACINE = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(RACINE, "supabase/migrations");
const SRC = path.join(RACINE, "src");

// Migration qui introduit le rafraîchissement automatique des privilèges.
// Ce qui la précède relève de l'histoire du dépôt, pas d'une régression.
const DEPUIS = "20260813220000";

const listerFichiers = (dir: string, suffixes: string[]): string[] => {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const complet = path.join(dir, entree.name);
    if (entree.isDirectory()) sortie.push(...listerFichiers(complet, suffixes));
    else if (suffixes.some((s) => entree.name.endsWith(s))) sortie.push(complet);
  }
  return sortie;
};

describe("privilèges de lecture sur errands", () => {
  it("toute migration qui ajoute une colonne à errands rafraîchit les privilèges", () => {
    const fautives: string[] = [];

    for (const fichier of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      const version = fichier.split("_")[0];
      if (version < DEPUIS) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS, fichier), "utf8");

      // On ne considère que les ALTER TABLE qui visent errands elle-même.
      const ajouteUneColonne = /ALTER\s+TABLE\s+(?:public\.)?errands\b[\s\S]*?ADD\s+COLUMN/i.test(sql);
      if (!ajouteUneColonne) continue;

      if (!/refresh_errand_column_grants\s*\(\s*\)/i.test(sql)) fautives.push(fichier);
    }

    expect(
      fautives,
      "ces migrations ajoutent une colonne à errands sans appeler " +
        "public.refresh_errand_column_grants() : la colonne restera illisible"
    ).toEqual([]);
  });

  it("aucun écran ne lit errands par une étoile", () => {
    const fautifs: string[] = [];

    for (const fichier of listerFichiers(SRC, [".ts", ".tsx"])) {
      if (fichier.includes(`${path.sep}test${path.sep}`) || /\.test\.tsx?$/.test(fichier)) continue;

      const code = fs.readFileSync(fichier, "utf8");
      // from("errands") suivi, dans les lignes qui suivent, d'un select étoile.
      const motif = /from\(\s*["']errands["']\s*\)[\s\S]{0,200}?\.select\(\s*["']\*["']/g;
      if (motif.test(code)) fautifs.push(path.relative(RACINE, fichier));
    }

    expect(
      fautifs,
      "un select étoile sur errands demande aussi handover_code, qui n'est " +
        "accordé à personne : la requête échoue pour tout le monde"
    ).toEqual([]);
  });

  it("la fonction de rafraîchissement exclut bien le code de remise", () => {
    const fichier = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.startsWith(DEPUIS))
      .map((f) => path.join(MIGRATIONS, f))[0];

    expect(fichier, "la migration qui pose le rafraîchissement est introuvable").toBeTruthy();

    const sql = fs.readFileSync(fichier, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_errand_column_grants/i);
    // Le code de remise doit être exclu nommément de la liste calculée.
    expect(sql).toMatch(/attname\s*<>\s*'handover_code'/i);
  });
});
