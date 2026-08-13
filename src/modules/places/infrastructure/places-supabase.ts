import { supabase } from "@/integrations/supabase/client";
import { avecReprise } from "@/lib/retry";
import type {
  CitySlug,
  Coordinates,
  OpeningHours,
  Place,
  PlaceType,
  PriceBand,
} from "../domain/types";

/**
 * Adaptateur de lecture du catalogue de lieux.
 *
 * Les écrans publics consomment la table `places` filtrée sur les fiches
 * publiées, ce qui fait enfin apparaître côté client les établissements
 * inscrits par les partenaires et approuvés en modération.
 */

type Row = Record<string, unknown>;

const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const asHours = (value: unknown): OpeningHours => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const h = value as Record<string, unknown>;
    return {
      open: h.open !== false,
      today: typeof h.today === "string" ? h.today : undefined,
      note: typeof h.note === "string" ? h.note : undefined,
    };
  }
  return { open: true };
};

const asCoords = (row: Row): Coordinates => ({
  lat: Number(row.lat ?? 0),
  lng: Number(row.lng ?? 0),
});

const clampStanding = (value: unknown): Place["standing"] => {
  const n = Math.round(Number(value ?? 3));
  const bounded = Math.min(5, Math.max(1, Number.isFinite(n) ? n : 3));
  return bounded as Place["standing"];
};

/** Convertit une ligne Supabase en objet du domaine. */
export function toPlace(row: Row): Place {
  return {
    id: String(row.id),
    slug: String(row.slug),
    type: row.type as PlaceType,
    name: String(row.name),
    tagline: typeof row.tagline === "string" ? row.tagline : "",
    description: typeof row.description === "string" ? row.description : "",
    story: typeof row.story === "string" ? row.story : undefined,
    city: String(row.city) as CitySlug,
    zone: typeof row.zone === "string" ? row.zone : undefined,
    address: String(row.address ?? ""),
    coords: asCoords(row),
    standing: clampStanding(row.standing),
    priceBand: (row.price_band ?? "€€") as PriceBand,
    hours: asHours(row.hours),
    services: asArray(row.services),
    tags: asArray(row.tags),
    cuisines: asArray(row.cuisines),
    whyVisit: asArray(row.why_visit),
    bestFor: asArray(row.best_for),
    bestTime: typeof row.best_time === "string" ? row.best_time : undefined,
    averageDuration: typeof row.average_duration === "string" ? row.average_duration : undefined,
    practicalTips: asArray(row.practical_tips),
    phone: typeof row.phone === "string" ? row.phone : undefined,
    whatsapp: typeof row.whatsapp === "string" ? row.whatsapp : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    website: typeof row.website === "string" ? row.website : undefined,
    image: typeof row.image === "string" ? row.image : "",
    gallery: asArray(row.gallery),
    premium: row.premium === true,
    curatorNote: typeof row.curator_note === "string" ? row.curator_note : undefined,
  };
}

// Littéral d'un seul tenant : c'est ce qui permet à supabase-js d'inférer le
// type des lignes retournées.
const SELECT =
  "id,slug,name,type,city,zone,address,tagline,description,story,lat,lng,standing,price_band,phone,whatsapp,email,website,image,gallery,services,tags,cuisines,why_visit,best_for,best_time,average_duration,practical_tips,curator_note,premium,hours" as const;

/** Catalogue publié, trié pour mettre en avant les adresses sélectionnées. */
export async function fetchPublishedPlaces(): Promise<Place[]> {
  return avecReprise(async () => {
    const { data, error } = await supabase
      .from("places")
      .select(SELECT)
      .eq("status", "published")
      .order("premium", { ascending: false })
      .order("standing", { ascending: false })
      .order("name");

    if (error) throw error;
    return ((data ?? []) as Row[]).map(toPlace);
  });
}

/** Fiche unique par identifiant lisible. */
export async function fetchPlaceBySlug(slug: string): Promise<Place | null> {
  return avecReprise(async () => {
    const { data, error } = await supabase
      .from("places")
      .select(SELECT)
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data ? toPlace(data as Row) : null;
  });
}

/** Résolution d'une liste d'identifiants, utilisée par les favoris et les parcours. */
export async function fetchPlacesByIds(ids: string[]): Promise<Place[]> {
  if (ids.length === 0) return [];

  return avecReprise(async () => {
    const { data, error } = await supabase
      .from("places")
      .select(SELECT)
      .eq("status", "published")
      .in("id", ids);

    if (error) throw error;

    const byId = new Map(((data ?? []) as Row[]).map((row) => [String(row.id), toPlace(row)]));
    // On respecte l'ordre demandé, que ce soit celui d'un parcours ou celui des favoris.
    return ids.map((id) => byId.get(id)).filter((p): p is Place => Boolean(p));
  });
}
