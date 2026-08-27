import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Chaque droit demandé par un écran doit exister.
 *
 * La console se gardait avec deux rôles hérités : un responsable financier, qui
 * n'est ni administrateur ni modérateur, n'y voyait rien, alors que la matrice
 * lui accordait les retraits et les barèmes. Les écrans demandent désormais le
 * droit qui correspond à ce qu'ils font.
 *
 * Le risque a changé de nature. Une faute de frappe dans un code, « courses.lir »
 * au lieu de « courses.lire », ne lève aucune erreur : elle ferme l'écran à tout
 * le monde, définitivement et en silence. Ce contrôle la rend impossible.
 */

const RACINE = path.resolve(__dirname, "..", "..");

/** Le catalogue, lu là où il est défini plutôt que recopié ici. */
function cataloguePermissions(): Set<string> {
  const codes = new Set<string>();
  const migrations = path.join(RACINE, "supabase/migrations");
  for (const fichier of fs.readdirSync(migrations)) {
    const sql = fs.readFileSync(path.join(migrations, fichier), "utf8");
    // Les codes sont insérés dans public.permissions : on les y lit.
    const bloc = sql.split("INSERT INTO public.permissions");
    for (const morceau of bloc.slice(1)) {
      for (const m of morceau.matchAll(/\('([a-z_]+(?:\.[a-z_]+)+)'/g)) {
        codes.add(m[1]);
      }
    }
  }
  return codes;
}

/** Tous les appels peut("…") des sources. */
function droitsDemandes(): { fichier: string; code: string }[] {
  const trouves: { fichier: string; code: string }[] = [];
  const parcourir = (dossier: string) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) {
        parcourir(complet);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      // Ce fichier cite les motifs qu'il cherche : il s'exclut de son propre
      // balayage, sinon il se declarerait fautif.
      if (path.resolve(complet) === path.resolve(__filename)) continue;
      const source = fs.readFileSync(complet, "utf8");
      for (const m of source.matchAll(/\bpeut\(\s*"([^"]+)"\s*\)/g)) {
        trouves.push({ fichier: path.relative(RACINE, complet), code: m[1] });
      }
      for (const m of source.matchAll(/droit:\s*"([^"]+)"/g)) {
        trouves.push({ fichier: path.relative(RACINE, complet), code: m[1] });
      }
    }
  };
  parcourir(path.join(RACINE, "src"));
  return trouves;
}

describe("les droits demandés par la console existent", () => {
  const catalogue = cataloguePermissions();
  const demandes = droitsDemandes();

  it("le catalogue est bien lu", () => {
    // Si la lecture échouait, tous les contrôles suivants passeraient à vide.
    expect(catalogue.size).toBeGreaterThanOrEqual(25);
    expect(catalogue.has("courses.lire")).toBe(true);
    expect(catalogue.has("retraits.approuver")).toBe(true);
  });

  it("des écrans demandent réellement des droits", () => {
    expect(demandes.length).toBeGreaterThanOrEqual(10);
  });

  it("aucun écran ne demande un droit qui n'existe pas", () => {
    const inconnus = demandes.filter((d) => !catalogue.has(d.code));
    expect(
      inconnus.map((d) => `${d.code} dans ${d.fichier}`),
      "un code inexistant ferme l'écran à tout le monde, sans lever d'erreur"
    ).toEqual([]);
  });

  it("la console n'est plus gardée par les rôles hérités seuls", () => {
    // Les écrans passés sous le régime des droits ne doivent pas retomber sur
    // isAdmin ou isModerator pour décider ce qu'ils affichent.
    const pages = [
      "src/pages/admin/PayoutsPage.tsx",
      "src/pages/admin/SettingsPage.tsx",
      "src/pages/admin/DisputesPage.tsx",
      "src/pages/admin/ShoppersPage.tsx",
      "src/pages/admin/ErrandsPage.tsx",
    ];
    for (const page of pages) {
      const source = fs.readFileSync(path.join(RACINE, page), "utf8");
      expect(source, `${page} doit demander un droit`).toMatch(/\bpeut\(/);
      expect(
        source.includes("useAuth()") && /const \{[^}]*\bisAdmin\b[^}]*\} = useAuth\(\)/.test(source),
        `${page} ne doit plus lire isAdmin depuis le contexte`
      ).toBe(false);
    }
  });

  it("la séparation des pouvoirs tient dans la matrice publiée", () => {
    const matrice = fs.readFileSync(
      path.join(RACINE, "supabase/migrations/20260827110000_matrice_droits_fins.sql"),
      "utf8"
    );
    const ligne = (role: string, droit: string) =>
      matrice.includes(`('${role}', '${droit}')`);

    // Le financier déplace de l'argent mais ne voit aucune pièce d'identité.
    expect(ligne("admin_finance", "retraits.approuver")).toBe(true);
    expect(ligne("admin_finance", "shoppers.identite.lire")).toBe(false);

    // Le conformité voit les pièces et le journal, mais ne touche pas l'argent.
    expect(ligne("admin_conformite", "shoppers.identite.lire")).toBe(true);
    expect(ligne("admin_conformite", "retraits.approuver")).toBe(false);

    // Personne, hors super administrateur, n'attribue les rôles.
    for (const role of ["admin_plateforme", "admin_finance", "admin_support", "admin_conformite"]) {
      expect(ligne(role, "roles.attribuer"), `${role} ne doit pas attribuer de rôles`).toBe(false);
    }
  });
});
