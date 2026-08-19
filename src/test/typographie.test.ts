import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Typographie : ni tiret cadratin, ni tiret demi-cadratin, nulle part.
 *
 * La règle vaut pour tout ce qui est écrit : code, commentaires, textes vus par
 * le client, documentation, migrations. Elle a été appliquée à la main, donc
 * elle se défera à la main : trente et une occurrences dormaient dans le dépôt,
 * dont sept dans des textes lus par un visiteur, un horaire d'ouverture et une
 * heure conseillée notamment.
 *
 * Les caractères sont désignés par leur point de code : un contrôle qui
 * interdit un caractère ne doit pas obliger à l'écrire.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const CADRATIN = 0x2014;
const DEMI_CADRATIN = 0x2013;

const DOSSIERS = ["src", "supabase/functions", "supabase/migrations", "docs", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".sql", ".md", ".mjs", ".css"];

/**
 * Fichiers exclus, avec la raison. Chaque exclusion est une dette assumée, pas
 * une commodité.
 */
const EXCLUS: Record<string, string> = {
  "src/integrations/supabase/types.ts":
    "Fichier généré depuis la base par l'outil Supabase : il se réécrit entier " +
    "à chaque régénération, le corriger à la main n'aurait aucun effet durable.",
  "supabase/migrations/20260813090000_f4b8d1e6-5a92-4c73-8e04-2d9f7a3b61c5.sql":
    "Migration déjà appliquée : la réécrire donnerait une histoire qui ne " +
    "correspond plus à ce qui s'est produit. Les lignes qu'elle a insérées sont " +
    "corrigées par la migration 20260819100000.",
};

function lister(dossier: string, acc: string[] = []): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!fs.existsSync(absolu)) return acc;
  for (const e of fs.readdirSync(absolu, { withFileTypes: true })) {
    const relatif = dossier + "/" + e.name;
    if (e.isDirectory()) lister(relatif, acc);
    else if (EXTENSIONS.some((x) => e.name.endsWith(x))) acc.push(relatif);
  }
  return acc;
}

describe("typographie du dépôt", () => {
  it("n'écrit nulle part un tiret cadratin ou demi-cadratin", () => {
    const fautifs: string[] = [];

    for (const fichier of DOSSIERS.flatMap((d) => lister(d))) {
      if (EXCLUS[fichier]) continue;
      const lignes = fs.readFileSync(path.join(RACINE, fichier), "utf8").split(String.fromCharCode(10));
      lignes.forEach((ligne, i) => {
        for (const caractere of ligne) {
          const point = caractere.charCodeAt(0);
          if (point === CADRATIN || point === DEMI_CADRATIN) {
            fautifs.push(fichier + ":" + (i + 1) + "  " + ligne.trim().slice(0, 80));
            return;
          }
        }
      });
    }

    expect(
      fautifs,
      "Remplacer par une virgule, un deux-points, des parenthèses ou deux phrases" +
        (fautifs.length ? String.fromCharCode(10) + fautifs.join(String.fromCharCode(10)) : "")
    ).toEqual([]);
  });

  it("corrige en base les textes déjà publiés avec un tiret", () => {
    const migration = fs.readFileSync(
      path.join(RACINE, "supabase/migrations/20260819100000_e5b9d7c3-8a41-4f26-9357-1d8e2c6b4a97.sql"),
      "utf8"
    );

    // Corriger le fichier source ne réécrit rien de ce qui est déjà inséré :
    // sans cette migration, le visiteur continuerait de lire l'ancien texte.
    expect(migration).toContain("UPDATE public.places");
    expect(migration).toContain("chr(8211)");
    expect(migration).toContain("chr(8212)");
    // Elle échoue si un texte lui échappe, plutôt que de se croire complète.
    expect(migration).toContain("RAISE EXCEPTION");
  });

  it("n'emploie aucun emoji dans les commentaires ni la documentation", () => {
    // La règle vise ce qui est écrit pour un lecteur du code : commentaires,
    // documentation, messages. Les pictogrammes affichés au visiteur sont un
    // choix d'interface, porté par les catalogues, et restent légitimes.
    const motif = new RegExp(
      "[" + String.fromCharCode(92) + "u{1F300}-" + String.fromCharCode(92) + "u{1FAFF}]",
      "u"
    );
    const estCommentaire = (ligne: string) => {
      const t = ligne.trimStart();
      return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("--");
    };
    const fautifs: string[] = [];

    for (const fichier of ["src", "supabase/functions", "supabase/migrations", "scripts"].flatMap((d) => lister(d))) {
      if (EXCLUS[fichier]) continue;
      const lignes = fs.readFileSync(path.join(RACINE, fichier), "utf8").split(String.fromCharCode(10));
      lignes.forEach((ligne, i) => {
        if (estCommentaire(ligne) && motif.test(ligne)) {
          fautifs.push(fichier + ":" + (i + 1) + "  " + ligne.trim().slice(0, 80));
        }
      });
    }

    expect(fautifs, "emoji dans un commentaire").toEqual([]);
  });
});
