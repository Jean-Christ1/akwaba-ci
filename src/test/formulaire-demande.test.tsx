import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { zonesOfCity } from "@/modules/places/application/useServiceAreas";
import { QUARTIERS_DE_SECOURS } from "@/modules/places/domain/service-areas-fallback";
import {
  LIBELLES_CONSIGNE,
  avertissementConsigne,
  quartierApresChangementDeVille,
} from "@/pages/courses/NewErrandPage";

/**
 * Formulaire de demande de course : deux pannes silencieuses.
 *
 * La première se voyait à l'écran sans que rien ne la signale. Changer de
 * ville ne recalait que la ville : le quartier de la ville précédente restait
 * dans l'état, disparaissait du sélecteur puisqu'il n'appartenait plus à la
 * liste, et partait quand même dans p_zone. La course s'affichait
 * « Cocody Centre, Bouaké » et aucun shopper filtrant par quartier ne la
 * voyait.
 *
 * La seconde ne se voyait pas du tout. La consigne de remplacement est posée
 * par un second appel serveur, dont le résultat n'était pas lu : sur une
 * coupure réseau, fréquente depuis un téléphone, la course gardait la consigne
 * par défaut pendant que le client lisait un message de succès. L'écart
 * n'apparaissait qu'au moment où le shopper proposait un remplacement.
 *
 * Les quartiers employés ici viennent du référentiel réel de l'application,
 * pas d'une liste inventée pour les besoins du contrôle.
 */

const RACINE = path.resolve(__dirname, "../..");
const page = fs.readFileSync(
  path.join(RACINE, "src/pages/courses/NewErrandPage.tsx"),
  "utf8"
);

const quartiersAbidjan = zonesOfCity(QUARTIERS_DE_SECOURS, "abidjan");
const quartiersBouake = zonesOfCity(QUARTIERS_DE_SECOURS, "bouake");

describe("quartier et changement de ville", () => {
  it("part d'un référentiel où les deux villes ont des quartiers distincts", () => {
    // Sans cette vérification, les contrôles suivants pourraient passer parce
    // que les listes sont vides plutôt que parce que la règle est juste.
    expect(quartiersAbidjan).toContain("Cocody Centre");
    expect(quartiersBouake).toContain("Koko");
    expect(quartiersBouake).not.toContain("Cocody Centre");
  });

  it("abandonne le quartier qui n'appartient plus à la ville choisie", () => {
    // Le défaut d'origine : ce quartier partait dans p_zone avec la ville
    // Bouaké, et la course devenait introuvable par filtre de quartier.
    expect(quartierApresChangementDeVille("Cocody Centre", quartiersBouake, true)).toBe("");
  });

  it("conserve le quartier qui existe dans la ville choisie", () => {
    expect(quartierApresChangementDeVille("Koko", quartiersBouake, true)).toBe("Koko");
  });

  it("ne vide rien tant que le référentiel n'est pas chargé", () => {
    // Les quartiers viennent de la base : au premier rendu, la liste peut être
    // vide ou incomplète sans que le quartier choisi soit faux pour autant.
    // Vider ici casserait le cas normal.
    expect(quartierApresChangementDeVille("Cocody Centre", [], false)).toBe("Cocody Centre");
    expect(quartierApresChangementDeVille("Cocody Centre", quartiersBouake, false)).toBe(
      "Cocody Centre"
    );
  });

  it("n'invente aucun quartier quand le client n'en a choisi aucun", () => {
    expect(quartierApresChangementDeVille("", quartiersAbidjan, true)).toBe("");
  });

  it("est branché sur la liste des quartiers de la ville courante", () => {
    // Une fonction juste mais jamais appelée laisserait le défaut intact.
    expect(page).toMatch(/setZone\(\s*\(\w*\)\s*=>\s*quartierApresChangementDeVille\(/);
    // Le drapeau de chargement doit être transmis, sinon la garde ci-dessus ne
    // sert à rien.
    expect(page).toContain("!chargementZones");
  });
});

describe("consigne de remplacement non enregistrée", () => {
  it("ne dit rien quand la consigne a bien été posée", () => {
    expect(avertissementConsigne("never", false)).toBeNull();
    expect(avertissementConsigne("similar", false)).toBeNull();
    expect(avertissementConsigne("ask", false)).toBeNull();
  });

  it("dit que la course existe, et que seule la consigne manque", () => {
    const message = avertissementConsigne("never", true);

    expect(message).toBeTruthy();
    // Le client ne doit pas croire que sa demande est perdue : elle est bien
    // publiée, c'est la consigne seule qui n'a pas été posée.
    expect(message).toContain("Demande publiée");
    expect(message).toMatch(/n'a pas été enregistrée/);
    expect(message).not.toMatch(/échec de la publication|n'a pas été publiée|recommencez/i);
  });

  it("cite la consigne demandée et celle qui s'applique réellement", () => {
    const message = avertissementConsigne("never", true);
    // Annoncer l'écart sans dire ce qui s'applique laisserait le client
    // deviner ce que le shopper va faire devant le rayon.
    expect(message).toContain(LIBELLES_CONSIGNE.never);
    expect(message).toContain(LIBELLES_CONSIGNE.ask);

    const equivalent = avertissementConsigne("similar", true);
    expect(equivalent).toContain(LIBELLES_CONSIGNE.similar);
  });

  it("n'alarme pas le client dont le choix est déjà celui appliqué par défaut", () => {
    // La colonne vaut 'ask' par défaut (migration 20260815210000) : l'appel
    // manqué n'a alors rien changé, avertir inquiéterait pour rien.
    expect(avertissementConsigne("ask", true)).toBeNull();
  });

  it("récupère réellement l'erreur du second appel et en avertit le client", () => {
    expect(page).toMatch(
      /\{\s*error:\s*\w+\s*\}\s*=\s*await supabase\.rpc\("errand_set_substitution_policy"/
    );
    expect(page).toContain("toast.warning");

    // Le défaut d'origine : l'appel était lancé sans que son retour soit lu.
    const lignes = page.split("\n").map((l) => l.trim());
    expect(
      lignes.some((l) => l.startsWith('await supabase.rpc("errand_set_substitution_policy"')),
      "le résultat de l'appel doit être affecté, pas jeté"
    ).toBe(false);
  });

  it("propose au client les libellés que l'avertissement reprend", () => {
    // Deux copies du même libellé finiraient par diverger, et le message
    // citerait alors un choix que le client n'a jamais lu.
    expect(page).toContain("{LIBELLES_CONSIGNE.ask}");
    expect(page).toContain("{LIBELLES_CONSIGNE.similar}");
    expect(page).toContain("{LIBELLES_CONSIGNE.never}");
  });
});
