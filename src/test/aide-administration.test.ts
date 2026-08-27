import { describe, expect, it } from "vitest";

import { slugDepuisQuestion } from "@/modules/admin/HelpArticlesEditor";

/**
 * L'identifiant d'une réponse doit être accepté par le serveur.
 *
 * La base n'accepte que des minuscules, des chiffres et des tirets. Laisser
 * quelqu'un le saisir à la main produirait un refus incompréhensible au moment
 * d'enregistrer, après avoir écrit toute la réponse.
 */
describe("identifiant d'une réponse d'aide", () => {
  const ACCEPTE_PAR_LA_BASE = /^[a-z0-9-]+$/;

  it("tire un identifiant valide d'une question accentuée", () => {
    const slug = slugDepuisQuestion("Comment le prix de ma course est-il calculé ?");
    expect(slug).toMatch(ACCEPTE_PAR_LA_BASE);
    expect(slug).toBe("comment-le-prix-de-ma-course-est-il-calcule");
  });

  it("survit à la ponctuation et aux apostrophes", () => {
    for (const question of [
      "Qu'est-ce qu'Akwaba, concrètement ?",
      "J'ai moins de dix-huit ans, puis-je être shopper ?",
      "Où est-ce que je reçois le suivi de mes courses ?",
      "Akwaba garde-t-elle mon argent ?",
    ]) {
      expect(slugDepuisQuestion(question)).toMatch(ACCEPTE_PAR_LA_BASE);
    }
  });

  it("ne laisse jamais de tiret en bordure", () => {
    // La contrainte de la base les refuse, et un identifiant tronqué par la
    // limite de longueur finit souvent sur un tiret.
    expect(slugDepuisQuestion("  ??? Une question ???  ")).toBe("une-question");
    const long = slugDepuisQuestion("a".repeat(40) + " " + "b".repeat(40));
    expect(long).toMatch(ACCEPTE_PAR_LA_BASE);
    expect(long.endsWith("-")).toBe(false);
  });
});
