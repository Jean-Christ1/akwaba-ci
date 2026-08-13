/**
 * Géocodage et calcul de trajet.
 *
 * L'assiette tarifaire d'une course dépend de la distance et de la durée. Tant
 * qu'elles sont saisies à la main, le prix n'est adossé à rien de vérifiable :
 * ce module les dérive d'une adresse réelle.
 *
 * Les services publics utilisés ici, Nominatim et OSRM, conviennent à un
 * démarrage mais n'offrent aucun engagement de service. Le passage en volume
 * suppose un fournisseur avec clé et quota : c'est la raison pour laquelle les
 * points d'entrée sont regroupés ici, derrière une interface stable.
 */

export interface Adresse {
  label: string;
  lat: number;
  lng: number;
  ville?: string;
  quartier?: string;
}

export interface Trajet {
  distanceKm: number;
  dureeMinutes: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1";

/** Boîte englobante approximative de la Côte d'Ivoire, pour écarter le bruit. */
const VIEWBOX = "-8.6,10.7,-2.4,4.2";

interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/**
 * Recherche d'adresses, limitée à la Côte d'Ivoire.
 *
 * Renvoie une liste vide plutôt qu'une erreur : une recherche d'adresse qui
 * échoue ne doit jamais empêcher de créer une course, la saisie manuelle reste
 * toujours possible.
 */
export async function rechercherAdresse(requete: string, signal?: AbortSignal): Promise<Adresse[]> {
  const terme = requete.trim();
  if (terme.length < 3) return [];

  const url =
    `${NOMINATIM}?format=jsonv2&limit=5&countrycodes=ci&addressdetails=1` +
    `&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(terme)}`;

  try {
    const reponse = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!reponse.ok) return [];

    const lignes = (await reponse.json()) as NominatimRow[];
    return lignes
      .filter((l) => l.lat && l.lon)
      .map((l) => {
        const a = l.address ?? {};
        return {
          label: l.display_name ?? terme,
          lat: Number(l.lat),
          lng: Number(l.lon),
          ville: a.city ?? a.town ?? a.village ?? a.municipality,
          quartier: a.suburb ?? a.neighbourhood ?? a.quarter,
        };
      })
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
  } catch {
    return [];
  }
}

/**
 * Distance routière et durée entre deux points.
 *
 * Renvoie null si le service ne répond pas : l'appelant conserve alors sa
 * saisie manuelle plutôt que de se voir imposer une valeur inventée.
 */
export async function calculerTrajet(
  depart: { lat: number; lng: number },
  arrivee: { lat: number; lng: number },
  profil: "driving" | "cycling" | "walking" = "driving",
  signal?: AbortSignal
): Promise<Trajet | null> {
  const url =
    `${OSRM}/${profil}/${depart.lng},${depart.lat};${arrivee.lng},${arrivee.lat}` +
    `?overview=false&alternatives=false`;

  try {
    const reponse = await fetch(url, { signal });
    if (!reponse.ok) return null;

    const data = (await reponse.json()) as {
      routes?: { distance?: number; duration?: number }[];
    };
    const route = data.routes?.[0];
    if (!route?.distance || !route?.duration) return null;

    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      dureeMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

/** Profil de trajet correspondant au véhicule choisi pour la mission. */
export function profilPourVehicule(vehicule: string): "driving" | "cycling" | "walking" {
  if (vehicule === "a_pied") return "walking";
  if (vehicule === "moto" || vehicule === "tricycle") return "cycling";
  return "driving";
}

/**
 * Durée de mission estimée.
 *
 * Le trajet ne représente qu'une partie du temps passé : il faut y ajouter le
 * temps en rayon, qui croît avec le nombre d'articles, et le trajet retour
 * lorsque le shopper livre lui-même.
 */
export function estimerDureeMission(
  trajet: Trajet,
  nombreArticles: number,
  livraisonParLeShopper: boolean
): number {
  const enRayon = 10 + Math.min(nombreArticles, 40) * 1.5;
  const retour = livraisonParLeShopper ? trajet.dureeMinutes : 0;
  return Math.round(trajet.dureeMinutes + enRayon + retour);
}

/**
 * Points de référence des villes couvertes.
 *
 * À la création d'une course, la position du shopper est inconnue : le trajet
 * est donc estimé depuis le centre de la ville de la mission. C'est une
 * approximation assumée, mais adossée à une géographie réelle, là où la saisie
 * libre ne reposait sur rien.
 */
export const CENTRES_VILLES: Record<string, { lat: number; lng: number }> = {
  Abidjan: { lat: 5.3364, lng: -4.0267 },
  "Grand-Bassam": { lat: 5.2118, lng: -3.7387 },
  Assinie: { lat: 5.1333, lng: -3.2833 },
  Yamoussoukro: { lat: 6.8276, lng: -5.2893 },
  Bouaké: { lat: 7.6939, lng: -5.0303 },
  "San-Pédro": { lat: 4.7485, lng: -6.6363 },
  Korhogo: { lat: 9.4578, lng: -5.6294 },
  Daloa: { lat: 6.8772, lng: -6.4502 },
};

/** Repère de départ retenu pour estimer un trajet dans une ville donnée. */
export function centreVille(ville: string): { lat: number; lng: number } {
  return CENTRES_VILLES[ville] ?? CENTRES_VILLES.Abidjan;
}
