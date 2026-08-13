import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface ServiceCity {
  slug: string;
  name: string;
  region: string | null;
  lat: number;
  lng: number;
  /** Les courses ne sont ouvertes que là où un réseau de shoppers existe. */
  errandsEnabled: boolean;
}

export interface ServiceZone {
  citySlug: string;
  name: string;
  /** Commune de rattachement, pour les villes découpées comme Abidjan. */
  parentName: string | null;
}

interface Etat {
  cities: ServiceCity[];
  zones: ServiceZone[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Référentiel des zones de service.
 *
 * Villes et quartiers viennent de la base : ouvrir une nouvelle ville relève
 * désormais de l'exploitation, non d'une livraison de code. Le référentiel
 * porte les deux formes d'identifiant, ce qui réconcilie enfin le catalogue de
 * lieux, qui emploie un identifiant en minuscules, et les courses, qui
 * stockent le nom affiché.
 */
export function useServiceAreas(): Etat {
  const [cities, setCities] = useState<ServiceCity[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let annule = false;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase
        .from("service_cities")
        .select("slug,name,region,lat,lng,errands_enabled")
        .eq("is_active", true)
        .order("position"),
      supabase
        .from("service_zones")
        .select("city_slug,name,parent_name")
        .eq("is_active", true)
        .order("position"),
    ])
      .then(([villes, quartiers]) => {
        if (annule) return;
        if (villes.error || quartiers.error) {
          setError("Impossible de charger les villes couvertes.");
          return;
        }
        setCities(
          (villes.data ?? []).map((v) => ({
            slug: v.slug,
            name: v.name,
            region: v.region,
            lat: Number(v.lat),
            lng: Number(v.lng),
            errandsEnabled: v.errands_enabled,
          }))
        );
        setZones(
          (quartiers.data ?? []).map((z) => ({
            citySlug: z.city_slug,
            name: z.name,
            parentName: z.parent_name ?? null,
          }))
        );
      })
      .catch(() => {
        if (!annule) setError("Impossible de charger les villes couvertes.");
      })
      .finally(() => {
        if (!annule) setLoading(false);
      });

    return () => {
      annule = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { cities, zones, loading, error, reload };
}

/** Quartiers d'une ville donnée. */
export function zonesOfCity(zones: ServiceZone[], citySlug: string): string[] {
  return zones.filter((z) => z.citySlug === citySlug).map((z) => z.name);
}

/**
 * Quartiers regroupés par commune.
 *
 * À Abidjan, personne ne se situe par la seule commune : on dit « Angré, à
 * Cocody ». Le regroupement rend la liste utilisable au lieu d'aligner
 * soixante-dix quartiers à plat.
 */
export function zonesByParent(
  zones: ServiceZone[],
  citySlug: string
): { parent: string | null; zones: string[] }[] {
  const ville = zones.filter((z) => z.citySlug === citySlug);
  const groupes = new Map<string | null, string[]>();

  for (const z of ville) {
    const cle = z.parentName ?? null;
    const liste = groupes.get(cle) ?? [];
    if (!liste.includes(z.name)) liste.push(z.name);
    groupes.set(cle, liste);
  }

  return Array.from(groupes.entries()).map(([parent, noms]) => ({ parent, zones: noms }));
}

/** Retrouve une ville à partir de son identifiant ou de son nom affiché. */
export function findCity(
  cities: ServiceCity[],
  valeur: string | null | undefined
): ServiceCity | undefined {
  if (!valeur) return undefined;
  const cible = valeur.trim().toLowerCase();
  return cities.find((c) => c.slug === cible || c.name.toLowerCase() === cible);
}
