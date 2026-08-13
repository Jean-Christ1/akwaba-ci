import { useCallback, useEffect, useState } from "react";

import type { Place } from "../domain/types";
import {
  fetchPlaceBySlug,
  fetchPlacesByIds,
  fetchPublishedPlaces,
} from "../infrastructure/places-supabase";

interface AsyncState<T> {
  data: T;
  loading: boolean;
  /** Distingue une absence de résultat d'un échec de chargement. */
  error: string | null;
  reload: () => void;
}

const MESSAGE =
  "Impossible de charger les adresses pour le moment. Vérifiez votre connexion, puis réessayez.";

/** Catalogue publié complet. */
export function usePlaces(): AsyncState<Place[]> {
  const [data, setData] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPublishedPlaces()
      .then((places) => {
        if (!cancelled) setData(places);
      })
      .catch(() => {
        if (!cancelled) setError(MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** Fiche unique résolue par son identifiant lisible. */
export function usePlace(slug: string | undefined): AsyncState<Place | null> {
  const [data, setData] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!slug) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlaceBySlug(slug)
      .then((place) => {
        if (!cancelled) setData(place);
      })
      .catch(() => {
        if (!cancelled) setError(MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** Résolution d'une liste d'identifiants, en préservant l'ordre demandé. */
export function usePlacesByIds(ids: string[]): AsyncState<Place[]> {
  const [data, setData] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // La clé stabilise l'effet : une nouvelle référence de tableau au même
  // contenu ne doit pas relancer une requête.
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlacesByIds(key ? key.split(",") : [])
      .then((places) => {
        if (!cancelled) setData(places);
      })
      .catch(() => {
        if (!cancelled) setError(MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
