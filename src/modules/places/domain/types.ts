// Domaine métier : types stables (port indépendant des providers)
export type PlaceType =
  | "lodging"
  | "restaurant"
  | "maquis"
  | "attraction"
  | "beach"
  | "nightlife"
  | "culture"
  | "shopping";

export type PriceBand = "€" | "€€" | "€€€" | "€€€€";

export type CitySlug = "abidjan" | "grand-bassam" | "assinie" | "yamoussoukro";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface OpeningHours {
  open: boolean;
  today?: string; // "12:00 à 23:30"
  note?: string;
}

export interface Place {
  id: string;
  slug: string;
  type: PlaceType;
  name: string;
  tagline: string;
  description: string;
  story?: string;
  city: CitySlug;
  zone?: string;
  address: string;
  coords: Coordinates;
  standing: 1 | 2 | 3 | 4 | 5;
  priceBand: PriceBand;
  hours: OpeningHours;
  services: string[];
  tags: string[];
  cuisines?: string[];
  whyVisit: string[];
  bestFor: string[];
  bestTime?: string;
  averageDuration?: string;
  practicalTips?: string[];
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  image: string;
  gallery?: string[];
  premium?: boolean;
  curatorNote?: string;
}

export interface City {
  slug: CitySlug;
  name: string;
  region: string;
  tagline: string;
  description: string;
  coords: Coordinates;
  image: string;
}

export interface Itinerary {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  city: CitySlug;
  durationHours: number;
  budgetBand: PriceBand;
  persona: string;
  image: string;
  steps: ItineraryStep[];
}

export interface ItineraryStep {
  position: number;
  placeId: string;
  suggestedTime: string;
  transportHint?: string;
  notes?: string;
}
