import {
  boundedInteger,
  boundedNumber,
  isEmail,
  isHttpUrl,
  optionalText,
  requiredText,
  stringList,
} from "../_shared/validation.ts";

/** Valeurs de l'énumération place_type (migration initiale). */
const PLACE_TYPES = [
  "lodging",
  "restaurant",
  "maquis",
  "attraction",
  "beach",
  "nightlife",
  "culture",
  "shopping",
] as const;

/** Gammes de prix proposées par le formulaire partenaire. */
const PRICE_BANDS = ["€", "€€", "€€€", "€€€€"] as const;

/** Bornes géographiques du pays, la fiche décrivant un lieu ivoirien. */
const LAT_MIN = 4;
const LAT_MAX = 11;
const LNG_MIN = -9;
const LNG_MAX = -2;

export interface PlaceDraft {
  name: string;
  type: string;
  city: string;
  zone: string | null;
  address: string;
  tagline: string | null;
  description: string;
  story: string | null;
  lat: number;
  lng: number;
  standing: number;
  price_band: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  image: string | null;
  gallery: string[];
  services: string[];
  tags: string[];
  cuisines: string[];
  why_visit: string[];
  best_for: string[];
  best_time: string | null;
  practical_tips: string[];
  average_duration: string | null;
}

export type PlaceValidationResult =
  | { ok: true; data: PlaceDraft }
  | { ok: false; error: string };

/**
 * Valide la fiche soumise par un partenaire.
 *
 * Aucun champ de gouvernance (owner_id, status, premium, slug) n'est lu ici :
 * ils sont fixés par la fonction, hors de portée de l'appelant.
 */
export function validatePlaceDraft(input: unknown): PlaceValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Fiche invalide." };
  const p = input as Record<string, unknown>;

  const name = requiredText(p.name, 2, 120);
  if (!name) return { ok: false, error: "Nom de l'établissement invalide." };

  const type = PLACE_TYPES.find((t) => t === p.type);
  if (!type) return { ok: false, error: "Type d'établissement invalide." };

  const city = requiredText(p.city, 2, 80);
  if (!city) return { ok: false, error: "Ville invalide." };

  const address = requiredText(p.address, 4, 200);
  if (!address) return { ok: false, error: "Adresse invalide." };

  const description = requiredText(p.description, 10, 4000);
  if (!description) return { ok: false, error: "Description invalide (10 à 4000 caractères)." };

  const zone = optionalText(p.zone, 80);
  if (zone === undefined) return { ok: false, error: "Quartier invalide." };

  const tagline = optionalText(p.tagline, 200);
  if (tagline === undefined) return { ok: false, error: "Accroche invalide." };

  const story = optionalText(p.story, 4000);
  if (story === undefined) return { ok: false, error: "Histoire invalide." };

  const bestTime = optionalText(p.best_time, 200);
  if (bestTime === undefined) return { ok: false, error: "Meilleur moment invalide." };

  const averageDuration = optionalText(p.average_duration, 100);
  if (averageDuration === undefined) return { ok: false, error: "Durée moyenne invalide." };

  const phone = optionalText(p.phone, 30);
  if (phone === undefined) return { ok: false, error: "Téléphone invalide." };

  const whatsapp = optionalText(p.whatsapp, 30);
  if (whatsapp === undefined) return { ok: false, error: "Numéro WhatsApp invalide." };

  const emailRaw = optionalText(p.email, 255);
  if (emailRaw === undefined) return { ok: false, error: "Adresse email invalide." };
  if (emailRaw !== null && !isEmail(emailRaw)) {
    return { ok: false, error: "Adresse email invalide." };
  }

  const websiteRaw = optionalText(p.website, 500);
  if (websiteRaw === undefined) return { ok: false, error: "Site web invalide." };
  if (websiteRaw !== null && !isHttpUrl(websiteRaw)) {
    return { ok: false, error: "Site web invalide (adresse http ou https attendue)." };
  }

  const imageRaw = optionalText(p.image, 500);
  if (imageRaw === undefined) return { ok: false, error: "Image invalide." };
  if (imageRaw !== null && !isHttpUrl(imageRaw)) {
    return { ok: false, error: "Image invalide (adresse http ou https attendue)." };
  }

  // Les coordonnées par défaut visent Abidjan, comme le formulaire.
  const lat = boundedNumber(p.lat ?? 5.32, LAT_MIN, LAT_MAX);
  if (lat === undefined) return { ok: false, error: "Latitude hors de la Côte d'Ivoire." };
  const lng = boundedNumber(p.lng ?? -4.03, LNG_MIN, LNG_MAX);
  if (lng === undefined) return { ok: false, error: "Longitude hors de la Côte d'Ivoire." };

  const standing = boundedInteger(p.standing ?? 3, 1, 5);
  if (standing === undefined) return { ok: false, error: "Standing invalide (1 à 5)." };

  const priceBand = PRICE_BANDS.find((b) => b === (p.price_band ?? "€€"));
  if (!priceBand) return { ok: false, error: "Gamme de prix invalide." };

  const gallery = stringList(p.gallery, 20, 500);
  if (gallery === undefined) return { ok: false, error: "Galerie invalide." };
  if (gallery.some((url) => !isHttpUrl(url))) {
    return { ok: false, error: "Galerie invalide (adresses http ou https attendues)." };
  }

  const lists: Array<[keyof PlaceDraft, unknown, string]> = [
    ["services", p.services, "Services"],
    ["tags", p.tags, "Étiquettes"],
    ["cuisines", p.cuisines, "Cuisines"],
    ["why_visit", p.why_visit, "Raisons de venir"],
    ["best_for", p.best_for, "Public visé"],
    ["practical_tips", p.practical_tips, "Conseils pratiques"],
  ];
  const parsedLists: Record<string, string[]> = {};
  for (const [key, value, label] of lists) {
    const parsed = stringList(value, 30, 300);
    if (parsed === undefined) return { ok: false, error: `${label} : liste invalide.` };
    parsedLists[key as string] = parsed;
  }

  return {
    ok: true,
    data: {
      name,
      type,
      city,
      zone,
      address,
      tagline,
      description,
      story,
      lat,
      lng,
      standing,
      price_band: priceBand,
      phone,
      whatsapp,
      email: emailRaw,
      website: websiteRaw,
      image: imageRaw,
      gallery,
      services: parsedLists.services,
      tags: parsedLists.tags,
      cuisines: parsedLists.cuisines,
      why_visit: parsedLists.why_visit,
      best_for: parsedLists.best_for,
      best_time: bestTime,
      practical_tips: parsedLists.practical_tips,
      average_duration: averageDuration,
    },
  };
}

/**
 * Fragment aléatoire ajouté au slug. Math.random n'offre aucune garantie
 * d'unicité ni d'imprévisibilité : une collision se traduirait par une
 * violation de contrainte d'unicité renvoyée en 500 au partenaire.
 */
export function slugSuffix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
