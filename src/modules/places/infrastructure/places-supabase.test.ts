import { describe, expect, it } from "vitest";

import { toPlace } from "./places-supabase";

const row = {
  id: "11111111-0000-4000-8000-000000000001",
  slug: "lodge-cocody-lagune",
  name: "Lodge Cocody Lagune",
  type: "lodging",
  city: "abidjan",
  zone: "Cocody",
  address: "Rue des Jardins",
  tagline: "Boutique-hôtel discret.",
  description: "Vingt-quatre chambres.",
  story: "Ouvert en 2021.",
  lat: "5.358",
  lng: "-3.998",
  standing: 5,
  price_band: "€€€€",
  phone: "+2252722441234",
  whatsapp: null,
  email: null,
  website: null,
  image: "/assets/place-hotel-cocody.jpg",
  gallery: ["/a.jpg"],
  services: ["Piscine", "Spa"],
  tags: ["Calme"],
  cuisines: [],
  why_visit: ["Architecture"],
  best_for: ["Couples"],
  best_time: "Fin d'après-midi",
  average_duration: "2 à 4 nuits",
  practical_tips: ["Chambre côté lagune"],
  curator_note: "Notre choix.",
  premium: true,
  hours: { open: true, today: "Réception 24h/24" },
};

describe("toPlace", () => {
  it("reconstruit une fiche complète depuis une ligne de la base", () => {
    const place = toPlace(row);
    expect(place.id).toBe("11111111-0000-4000-8000-000000000001");
    expect(place.slug).toBe("lodge-cocody-lagune");
    expect(place.name).toBe("Lodge Cocody Lagune");
    expect(place.premium).toBe(true);
    expect(place.services).toEqual(["Piscine", "Spa"]);
  });

  it("convertit les coordonnées numériques renvoyées sous forme de chaîne", () => {
    const place = toPlace(row);
    expect(place.coords.lat).toBeCloseTo(5.358);
    expect(place.coords.lng).toBeCloseTo(-3.998);
    expect(typeof place.coords.lat).toBe("number");
  });

  it("porte un identifiant réellement utilisable comme clé étrangère", () => {
    const place = toPlace(row);
    expect(place.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("borne le standing dans l'échelle de 1 à 5", () => {
    expect(toPlace({ ...row, standing: 42 }).standing).toBe(5);
    expect(toPlace({ ...row, standing: 0 }).standing).toBe(1);
    expect(toPlace({ ...row, standing: null }).standing).toBe(3);
  });

  it("ne casse pas sur des colonnes jsonb vides ou absentes", () => {
    const place = toPlace({ ...row, services: null, tags: undefined, gallery: "invalide" });
    expect(place.services).toEqual([]);
    expect(place.tags).toEqual([]);
    expect(place.gallery).toEqual([]);
  });

  it("ignore les entrées non textuelles d'un tableau jsonb", () => {
    const place = toPlace({ ...row, tags: ["Calme", 42, null, "Vue"] });
    expect(place.tags).toEqual(["Calme", "Vue"]);
  });

  it("considère un lieu comme ouvert par défaut si les horaires sont absents", () => {
    expect(toPlace({ ...row, hours: null }).hours.open).toBe(true);
    expect(toPlace({ ...row, hours: { open: false } }).hours.open).toBe(false);
  });

  it("restitue les horaires du jour quand ils sont renseignés", () => {
    expect(toPlace(row).hours.today).toBe("Réception 24h/24");
  });

  it("remplace les champs optionnels manquants par undefined plutôt que null", () => {
    const place = toPlace({ ...row, story: null, best_time: null, whatsapp: null });
    expect(place.story).toBeUndefined();
    expect(place.bestTime).toBeUndefined();
    expect(place.whatsapp).toBeUndefined();
  });
});
