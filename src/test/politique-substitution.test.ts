import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Consigne de remplacement donnée par le client.
 *
 * Un article manque en rayon dans presque toutes les courses d'achats. Le
 * client est rarement disponible à cet instant précis, et trois clients sur le
 * même produit veulent trois choses différentes : celui qui commande un
 * médicament ne veut aucun équivalent, celui qui commande du riz accepte
 * n'importe quelle marque, celui qui prépare un repas veut être consulté.
 *
 * La consigne est donc posée à la publication et appliquée par le serveur. Ces
 * tests gardent les deux moitiés en place : le choix côté formulaire, et le
 * fait que le moteur le fasse respecter plutôt que de l'afficher seulement.
 */

const RACINE = path.resolve(__dirname, "../..");
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

const migration = () => {
  const dossier = path.join(RACINE, "supabase/migrations");
  const fichier = fs.readdirSync(dossier).find((f) => f.startsWith("20260815210000"));
  expect(fichier, "la migration de la consigne est introuvable").toBeTruthy();
  return fs.readFileSync(path.join(dossier, fichier as string), "utf8");
};

describe("consigne de remplacement", () => {
  it("est proposée au client dans le formulaire de création", () => {
    const page = lire("src/pages/courses/NewErrandPage.tsx");

    expect(page).toContain("Si un article manque");
    // Les trois consignes doivent être offertes : n'en proposer que deux
    // reviendrait à décider à la place d'une partie des clients.
    expect(page).toContain('value="ask"');
    expect(page).toContain('value="similar"');
    expect(page).toContain('value="never"');
    expect(page).toContain("errand_set_substitution_policy");
  });

  it("explique au client ce que son choix implique", () => {
    const page = lire("src/pages/courses/NewErrandPage.tsx");
    // Un intitulé seul ne suffit pas : « prendre un équivalent » n'apprend pas
    // au client qu'un écart de prix important lui sera quand même soumis.
    expect(page).toMatch(/introuvable sans rien acheter d'autre/);
    expect(page).toMatch(/plus cher vous sera quand même soumis/);
  });

  it("est appliquée par le serveur, pas seulement affichée", () => {
    const sql = migration();

    // Refus explicite quand le client a exclu les remplacements : sans cela, un
    // shopper pourrait contourner la consigne depuis un appel direct.
    expect(sql).toMatch(/substitution_policy = 'never'/);
    expect(sql).toMatch(/Marquez l''article introuvable/);

    // Acceptation d'avance, bornée par une tolérance de prix : accepter un
    // équivalent n'est pas accepter n'importe quel montant.
    expect(sql).toMatch(/substitution_policy = 'similar'/);
    expect(sql).toMatch(/substitution_price_tolerance_pct/);
  });

  it("ne se change plus une fois les achats commencés", () => {
    const sql = migration();
    // Changer la consigne en cours de mission reviendrait à désavouer après
    // coup un shopper qui l'a suivie.
    expect(sql).toMatch(/La consigne ne se change plus une fois les achats commencés/);
  });

  it("n'alerte le client que lorsque sa décision est attendue", () => {
    const sql = migration();
    // Notifier un client qui a justement accepté d'avance les équivalents
    // reviendrait à lui redemander ce qu'il vient de trancher.
    expect(sql).toMatch(/IF p_state = 'substitute' AND NOT v_auto THEN/);
  });

  it("laisse la colonne lisible par les participants", () => {
    const sql = migration();
    // Une colonne ajoutée sans rafraîchir les privilèges reste invisible :
    // le shopper ne saurait pas quelle consigne suivre.
    expect(sql).toContain("refresh_errand_column_grants()");
  });
});
