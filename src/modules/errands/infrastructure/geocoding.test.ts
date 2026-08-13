import { describe, expect, it } from "vitest";

import {
  CENTRES_VILLES,
  centreVille,
  estimerDureeMission,
  profilPourVehicule,
} from "./geocoding";

describe("profilPourVehicule", () => {
  it("associe chaque véhicule à un mode de déplacement cohérent", () => {
    expect(profilPourVehicule("a_pied")).toBe("walking");
    expect(profilPourVehicule("moto")).toBe("cycling");
    expect(profilPourVehicule("tricycle")).toBe("cycling");
    expect(profilPourVehicule("voiture")).toBe("driving");
    expect(profilPourVehicule("camionnette")).toBe("driving");
  });

  it("retient la voiture pour un véhicule non précisé", () => {
    expect(profilPourVehicule("any")).toBe("driving");
    expect(profilPourVehicule("inconnu")).toBe("driving");
  });
});

describe("centreVille", () => {
  it("connaît les villes couvertes par le service", () => {
    expect(centreVille("Abidjan").lat).toBeCloseTo(5.3364, 3);
    expect(centreVille("Yamoussoukro").lng).toBeCloseTo(-5.2893, 3);
  });

  it("retombe sur Abidjan pour une ville inconnue", () => {
    expect(centreVille("Ville imaginaire")).toEqual(CENTRES_VILLES.Abidjan);
  });

  it("place toutes les villes dans les limites de la Côte d'Ivoire", () => {
    for (const [ville, c] of Object.entries(CENTRES_VILLES)) {
      expect(c.lat, ville).toBeGreaterThan(4);
      expect(c.lat, ville).toBeLessThan(11);
      expect(c.lng, ville).toBeGreaterThan(-9);
      expect(c.lng, ville).toBeLessThan(-2);
    }
  });
});

describe("estimerDureeMission", () => {
  const trajet = { distanceKm: 8, dureeMinutes: 20 };

  it("ajoute le temps en rayon au temps de trajet", () => {
    const duree = estimerDureeMission(trajet, 0, false);
    expect(duree).toBeGreaterThan(trajet.dureeMinutes);
  });

  it("compte le trajet retour quand le shopper livre lui-même", () => {
    const sansLivraison = estimerDureeMission(trajet, 5, false);
    const avecLivraison = estimerDureeMission(trajet, 5, true);
    expect(avecLivraison - sansLivraison).toBe(trajet.dureeMinutes);
  });

  it("allonge la mission avec le nombre d'articles", () => {
    const court = estimerDureeMission(trajet, 2, false);
    const long = estimerDureeMission(trajet, 30, false);
    expect(long).toBeGreaterThan(court);
  });

  it("plafonne l'effet du nombre d'articles pour rester réaliste", () => {
    const quarante = estimerDureeMission(trajet, 40, false);
    const deuxCents = estimerDureeMission(trajet, 200, false);
    expect(deuxCents).toBe(quarante);
  });

  it("renvoie toujours un entier de minutes positif", () => {
    const duree = estimerDureeMission({ distanceKm: 0, dureeMinutes: 1 }, 0, false);
    expect(Number.isInteger(duree)).toBe(true);
    expect(duree).toBeGreaterThan(0);
  });
});
