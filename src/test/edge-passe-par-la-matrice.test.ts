import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Les fonctions edge autorisent par la matrice, pas par le rôle hérité.
 *
 * Cette couche est la plus facile à oublier. Elle s'exécute avec la clé de
 * service, donc aucune politique de sécurité ne la rattrape : ce qu'elle décide
 * est ce qui se produit. Et elle vit en dehors de la base, si bien que les
 * mesures qui surveillent la matrice, `droits_jamais_consultes()` et
 * `portees_qui_ne_restreignent_pas()`, ne la voient pas.
 *
 * Deux fonctions y lisaient `user_roles` en direct et acceptaient les deux
 * rôles hérités. Un responsable de contenu à qui la console affiche « Modérer
 * les lieux » se faisait refuser la publication d'une fiche, et un ancien
 * modérateur sans rôle dans la matrice publiait encore.
 *
 * Deux usages restent légitimes et sont nommés ici plutôt qu'exclus en silence.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const FONCTIONS = path.join(RACINE, "supabase", "functions");

/**
 * Ce que chacune de ces deux fonctions fait de `user_roles`, et pourquoi cela
 * n'est pas une autorisation déguisée.
 */
const USAGES_LEGITIMES: Record<string, string> = {
  // Elle crée le tout premier administrateur, quand la matrice est vide et que
  // personne ne peut donc rien accorder. Elle se désactive dès qu'un
  // administrateur existe.
  "bootstrap-admin": "amorçage du premier administrateur",
  // Elle pose le rôle applicatif « partner », qui décrit ce qu'une personne
  // fait sur la plateforme et non ce qu'elle administre.
  "register-partner": "rôle applicatif d'un partenaire",
};

const lister = () =>
  fs
    .readdirSync(FONCTIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name);

const source = (nom: string) => {
  const fichier = path.join(FONCTIONS, nom, "index.ts");
  return fs.existsSync(fichier) ? fs.readFileSync(fichier, "utf8") : "";
};

/** Les lignes de code, commentaires retirés : un commentaire qui cite une
 *  table ne l'interroge pas. */
const codeSeul = (contenu: string) =>
  contenu
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

describe("les fonctions edge autorisent par la matrice", () => {
  it("aucune ne décide d'un accès en lisant user_roles", () => {
    const fautives = lister().filter(
      (nom) => !(nom in USAGES_LEGITIMES) && codeSeul(source(nom)).includes("user_roles")
    );
    expect(fautives).toEqual([]);
  });

  it("les deux usages restants sont nommés, et ne sont pas des autorisations", () => {
    for (const [nom, raison] of Object.entries(USAGES_LEGITIMES)) {
      const contenu = codeSeul(source(nom));
      expect(contenu, `${nom} : ${raison}`).toContain("user_roles");
      // Aucune des deux ne compare un rôle pour ouvrir ou fermer une porte.
      expect(contenu).not.toMatch(/r\.role === "moderator"/);
    }
  });

  it("celles qui décident consultent le droit du catalogue", () => {
    // La modération d'une fiche passe par la ville de la fiche : sans elle, la
    // restriction posée dans la console ne restreindrait rien ici.
    const moderation = source("moderate-place");
    expect(moderation).toContain('_code: "lieux.moderer"');
    expect(moderation).toContain("_scope_value: place.city");
    expect(moderation).toContain("has_scoped_permission");

    const essai = source("test-email");
    expect(essai).toContain('_code: "notifications.parametrer"');
  });

  it("la fiche est chargée avant que le droit soit vérifié", () => {
    // L'ordre compte : vérifier avant de charger la fiche revenait à ne pouvoir
    // demander que « quelque part », donc à perdre la ville.
    const contenu = source("moderate-place");
    expect(contenu.indexOf('.from("places")')).toBeGreaterThan(0);
    expect(contenu.indexOf('.from("places")')).toBeLessThan(
      contenu.indexOf("has_scoped_permission")
    );
  });
});
