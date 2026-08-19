import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Le contenu de valeur ne doit pas disparaître en se réorganisant.
 *
 * Le service s'est construit en plusieurs passes, par plusieurs mains. À chaque
 * remaniement, le risque est de jeter une formulation juste ou une garantie
 * concrète en croyant supprimer un doublon. Rien ne le signale : le code
 * compile, les tests passent, et le produit dit simplement moins de choses.
 *
 * Ces contrôles portent sur le SENS et non sur la lettre : une phrase peut être
 * reformulée ou déplacée, mais ce qu'elle promet doit rester dit quelque part.
 */

const RACINE = path.resolve(__dirname, "../..");

const lister = (dossier: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
    const rel = path.join(dossier, e.name).split(path.sep).join("/");
    if (e.isDirectory()) lister(rel, acc);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) acc.push(rel);
  }
  return acc;
};

// Tout le code applicatif en une seule chaîne : peu importe quel écran porte
// la promesse, ce qui compte est qu'elle soit encore dite.
const CODE = lister("src")
  .filter((f) => !f.includes(".test."))
  .map((f) => fs.readFileSync(path.join(RACINE, f), "utf8"))
  .join(String.fromCharCode(10));

describe("contenu de valeur", () => {
  it("la promesse fondatrice est toujours dite", () => {
    // Formule écrite pour le hub des services, et qui résume le produit mieux
    // que toute reformulation ultérieure.
    expect(CODE).toContain("quelqu'un le fait pour vous");
  });

  it("l'ancrage ivoirien reste revendiqué", () => {
    expect(CODE).toMatch(/ivoirien/i);
    expect(CODE).toMatch(/Côte d'Ivoire/);
  });

  it("les quatre publics du service restent adressés", () => {
    // Client, shopper, marchand, artisan : perdre un public revient à fermer
    // une porte d'entrée du service sans le décider.
    expect(CODE, "le client").toMatch(/Demander une course|Commander une course/);
    expect(CODE, "le shopper").toMatch(/Devenir shopper/);
    expect(CODE, "le marchand").toMatch(/Marchands|Inscrire mon commerce/);
    expect(CODE, "l'artisan").toMatch(/Artisans|artisan/);
  });

  it("les moyens de paiement locaux restent nommés", () => {
    // Nommer Wave et Orange Money vaut mieux que parler de « paiement mobile » :
    // c'est ce que le client reconnaît.
    for (const moyen of ["Wave", "Orange Money", "MoMo", "Moov"]) {
      expect(CODE, moyen + " doit rester nommé").toContain(moyen);
    }
  });

  it("les canaux de contact restent énoncés", () => {
    for (const canal of ["chat", "appel", "WhatsApp"]) {
      expect(CODE.toLowerCase(), canal + " doit rester cité").toContain(canal.toLowerCase());
    }
  });

  it("les garanties concrètes restent expliquées", () => {
    // Chacune correspond à un mécanisme réellement implanté : les taire
    // reviendrait à garder la protection sans que personne ne le sache.
    expect(CODE, "code de remise").toMatch(/code de remise/i);
    expect(CODE, "preuve d'achat").toMatch(/reçu|preuve/i);
    expect(CODE, "litige").toMatch(/litige/i);
    expect(CODE, "vérification du shopper").toMatch(/vérifié|validé/i);
  });

  it("la distinction budget d'achat et frais de service est exposée", () => {
    // C'est la première question de tout client, et la source de tout litige
    // quand elle reste implicite.
    expect(CODE, "budget d'achat").toMatch(/budget d'achat/i);
    expect(CODE, "frais de service").toMatch(/frais de service/i);
  });

  it("« Comment ça marche » reste atteignable, mais pas depuis l'accueil", () => {
    // Le propriétaire l'a retiré de l'accueil : ce n'est pas ce qu'on met en
    // avant. Il doit rester trouvable pour qui le cherche.
    const accueil = fs.readFileSync(
      path.join(RACINE, "src/modules/errands/ui/ShopperSpotlight.tsx"),
      "utf8"
    );
    expect(accueil, "pas d'accès depuis le bloc d'accueil").not.toContain("comment-ca-marche");
    expect(CODE, "mais atteignable ailleurs").toContain("comment-ca-marche");
  });
});
