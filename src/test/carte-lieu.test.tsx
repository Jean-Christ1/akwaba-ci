import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/contexts/AuthContext";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import type { Place } from "@/modules/places/domain/types";

/**
 * La carte d'un lieu.
 *
 * Le bouton favori vivait à l'intérieur du lien de la carte. Un contrôle
 * interactif dans une ancre n'est pas du HTML valide : la carte devient
 * imprévisible au toucher, et au clavier le bouton se parcourt à l'intérieur
 * du lien. Le dépôt le notait déjà ailleurs, sans l'avoir corrigé ici.
 */
const lieu = {
  id: "11111111-0000-4000-8000-000000000001",
  slug: "lodge-cocody-lagune",
  name: "Lodge Cocody Lagune",
  type: "lodging",
  city: "abidjan",
  zone: "Cocody",
  address: "Rue des Jardins",
  tagline: "Boutique-hôtel discret face à la lagune.",
  description: "",
  story: "",
  lat: 5.358,
  lng: -3.998,
  standing: 5,
  priceBand: "€€€€",
  image: "/places/exemple.jpg",
  gallery: [],
  services: [],
  tags: [],
  cuisines: [],
  whyVisit: [],
  bestFor: [],
  practicalTips: [],
  premium: true,
} as unknown as Place;

describe("carte d'un lieu", () => {
  it("ne place pas le bouton favori à l'intérieur du lien", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <PlaceCard place={lieu} />
        </AuthProvider>
      </MemoryRouter>
    );

    const favori = screen.getByRole("button", { name: /favoris/i });
    const lien = screen.getByRole("link");
    expect(lien.contains(favori), "le bouton ne doit pas être dans l'ancre").toBe(false);
  });

  it("nomme le lieu dans le libellé du bouton, et dit son état", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <PlaceCard place={lieu} />
        </AuthProvider>
      </MemoryRouter>
    );

    // Une liste de cartes offrait autant de boutons « Ajouter aux favoris »
    // identiques qu'il y a de lieux : au lecteur d'écran, rien ne les distingue.
    const favori = screen.getByRole("button", { name: /Lodge Cocody Lagune/i });
    expect(favori).toHaveAttribute("aria-pressed");
  });

  it("garde une cible tactile d'au moins 44 px", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <PlaceCard place={lieu} />
        </AuthProvider>
      </MemoryRouter>
    );

    const favori = screen.getByRole("button", { name: /favoris/i });
    expect(favori.className).toMatch(/\bh-11\b|\bmin-h-\[44px\]\b/);
  });
});
