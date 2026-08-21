import { useMemo } from "react";

import type { City } from "@/modules/places/domain/types";
import { CITIES } from "@/modules/places/infrastructure/data";
import { useServiceAreas } from "./useServiceAreas";

/**
 * Les villes du catalogue, filtrées par celles réellement ouvertes.
 *
 * Deux sources cohabitent, et chacune a sa raison d'être. Le contenu éditorial
 * d'une ville, sa photo, son accroche, son texte de présentation, vit dans le
 * dépôt : c'est de la rédaction, elle se relit et se livre. Son ouverture, en
 * revanche, vit en base : fermer une ville un matin ne doit pas demander une
 * livraison de code.
 *
 * Elles étaient jusqu'ici indépendantes, si bien que fermer une ville dans la
 * console ne la retirait d'aucun écran du catalogue. Le visiteur continuait de
 * la voir, de la parcourir, et de demander une réservation dans une ville que
 * la plateforme ne dessert plus.
 *
 * On croise donc les deux : la base décide de ce qui s'affiche, le dépôt de ce
 * qu'on y lit. Tant que la base ne répond pas, le catalogue reste entier, une
 * page d'accueil vide étant pire qu'une ville de trop.
 */
export function useCatalogCities(): { cities: City[]; loading: boolean } {
  const { cities: ouvertes, loading } = useServiceAreas();

  const cities = useMemo(() => {
    if (ouvertes.length === 0) return CITIES;

    const actives = new Set(ouvertes.map((v) => v.slug));
    const filtrees = CITIES.filter((c) => actives.has(c.slug));

    // Une base qui ne reconnaît aucune ville du catalogue signale une
    // désynchronisation, pas une fermeture générale : on préfère alors tout
    // montrer plutôt que de présenter un catalogue vide.
    return filtrees.length > 0 ? filtrees : CITIES;
  }, [ouvertes]);

  return { cities, loading };
}

/**
 * Les villes où l'on peut réellement commander une course.
 *
 * Proposer une ville sans réseau de shoppers revient à promettre un service que
 * personne ne peut assurer.
 */
export function useErrandCities(): { names: string[]; loading: boolean } {
  const { cities, loading } = useServiceAreas();

  const names = useMemo(
    () => cities.filter((v) => v.errandsEnabled).map((v) => v.name),
    [cities]
  );

  return { names, loading };
}
