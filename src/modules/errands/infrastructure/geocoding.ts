/**
 * Géocodage et calcul de trajet.
 *
 * L'assiette tarifaire d'une course dépend de la distance et de la durée. Tant
 * qu'elles sont saisies à la main, le prix n'est adossé à rien de vérifiable :
 * ce module les dérive d'une adresse réelle.
 *
 * Les instances publiques de démonstration de Nominatim et d'OSRM, retenues par
 * défaut, n'offrent aucun engagement de service et leurs conditions d'usage
 * excluent l'exploitation en production. Deux conséquences sont traitées ici.
 *
 * D'abord, leur adresse se règle par variable d'environnement,
 * VITE_NOMINATIM_URL et VITE_OSRM_URL : basculer vers une instance dédiée ou un
 * fournisseur commercial compatible ne demande alors aucune modification du
 * code.
 *
 * Ensuite, leur indisponibilité ne bloque jamais l'utilisateur. Toute requête
 * est bornée dans le temps, et le calcul d'itinéraire retombe sur une
 * estimation géométrique dont l'origine est signalée à l'appelant, qui doit
 * l'annoncer à l'écran. Un prix approché et assumé vaut mieux qu'un formulaire
 * figé sur une attente sans fin.
 */

export interface Adresse {
  label: string;
  lat: number;
  lng: number;
  ville?: string;
  quartier?: string;
}

/** Origine d'un trajet : mesuré par le routeur, ou approché sans lui. */
export type SourceTrajet = "routage" | "estimation";

export interface Trajet {
  distanceKm: number;
  dureeMinutes: number;
  source: SourceTrajet;
}

export interface ResultatRecherche {
  adresses: Adresse[];
  /** Vrai lorsque le service n'a pas répondu, à distinguer d'une absence de résultat. */
  indisponible: boolean;
}

export type ProfilTrajet = "driving" | "cycling" | "walking";

const NOMINATIM =
  import.meta.env.VITE_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search";
const OSRM = import.meta.env.VITE_OSRM_URL ?? "https://router.project-osrm.org/route/v1";

/** Au delà, on considère le service muet et on sert l'estimation de repli. */
const DELAI_REPONSE_MS = 8_000;

/** Boîte englobante approximative de la Côte d'Ivoire, pour écarter le bruit. */
const VIEWBOX = "-8.6,10.7,-2.4,4.2";

const RAYON_TERRE_KM = 6371;

/**
 * Rapport entre la distance routière et la distance à vol d'oiseau.
 *
 * La voirie ne va jamais tout droit. Ce coefficient, volontairement prudent,
 * évite de sous-estimer la course lorsque le routeur est injoignable.
 */
const FACTEUR_DETOUR = 1.35;

/** Vitesses moyennes retenues en agglomération ivoirienne, en km/h. */
const VITESSES_KMH: Record<ProfilTrajet, number> = {
  walking: 4.5,
  cycling: 18,
  driving: 22,
};

interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/**
 * Appel réseau borné dans le temps.
 *
 * Sans échéance, un service muet laisse la promesse en suspens et l'écran
 * bloqué sur son indicateur de chargement, ce qui est le pire des deux mondes :
 * ni résultat, ni possibilité de continuer.
 */
async function requeteBornee(
  url: string,
  signal?: AbortSignal,
  entetes?: HeadersInit
): Promise<Response> {
  const controleur = new AbortController();
  const echeance = window.setTimeout(() => controleur.abort(), DELAI_REPONSE_MS);
  const relayerAbandon = () => controleur.abort();
  signal?.addEventListener("abort", relayerAbandon);

  try {
    return await fetch(url, { signal: controleur.signal, headers: entetes });
  } finally {
    window.clearTimeout(echeance);
    signal?.removeEventListener("abort", relayerAbandon);
  }
}

/**
 * Recherche d'adresses, limitée à la Côte d'Ivoire.
 *
 * Le drapeau `indisponible` sépare deux situations que l'appelant ne doit pas
 * confondre : une recherche sans résultat, qui invite à reformuler, et un
 * service en panne, qui invite à saisir l'adresse librement.
 */
export async function rechercherAdresse(
  requete: string,
  signal?: AbortSignal
): Promise<ResultatRecherche> {
  const terme = requete.trim();
  if (terme.length < 3) return { adresses: [], indisponible: false };

  const url =
    `${NOMINATIM}?format=jsonv2&limit=5&countrycodes=ci&addressdetails=1` +
    `&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(terme)}`;

  try {
    const reponse = await requeteBornee(url, signal, { Accept: "application/json" });
    if (!reponse.ok) return { adresses: [], indisponible: true };

    const lignes = (await reponse.json()) as NominatimRow[];
    const adresses = lignes
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

    return { adresses, indisponible: false };
  } catch {
    // Une frappe suivante annule la précédente : ce n'est pas une panne.
    return { adresses: [], indisponible: signal?.aborted !== true };
  }
}

/** Distance à vol d'oiseau entre deux points, en kilomètres. */
export function distanceOrthodromiqueKm(
  depart: { lat: number; lng: number },
  arrivee: { lat: number; lng: number }
): number {
  const rad = (degres: number) => (degres * Math.PI) / 180;
  const dLat = rad(arrivee.lat - depart.lat);
  const dLng = rad(arrivee.lng - depart.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(depart.lat)) * Math.cos(rad(arrivee.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Trajet approché, sans service de routage.
 *
 * La distance à vol d'oiseau est majorée du détour de voirie, et la durée
 * dérivée d'une vitesse moyenne par mode de déplacement. C'est une
 * approximation, mais elle est reproductible et adossée à une géographie
 * réelle, là où un formulaire bloqué ne produit rien du tout.
 */
export function estimerTrajetSansRoutage(
  depart: { lat: number; lng: number },
  arrivee: { lat: number; lng: number },
  profil: ProfilTrajet = "driving"
): Trajet {
  const distanceKm = Math.round(distanceOrthodromiqueKm(depart, arrivee) * FACTEUR_DETOUR * 10) / 10;
  const dureeMinutes = Math.max(1, Math.round((distanceKm / VITESSES_KMH[profil]) * 60));
  return { distanceKm, dureeMinutes, source: "estimation" };
}

/**
 * Distance routière et durée entre deux points.
 *
 * Ne renvoie jamais null : si le routeur ne répond pas, l'estimation
 * géométrique prend le relais et le champ `source` le signale, à charge pour
 * l'écran appelant de le dire à l'utilisateur.
 */
export async function calculerTrajet(
  depart: { lat: number; lng: number },
  arrivee: { lat: number; lng: number },
  profil: ProfilTrajet = "driving",
  signal?: AbortSignal
): Promise<Trajet> {
  const url =
    `${OSRM}/${profil}/${depart.lng},${depart.lat};${arrivee.lng},${arrivee.lat}` +
    `?overview=false&alternatives=false`;

  try {
    const reponse = await requeteBornee(url, signal);
    if (!reponse.ok) return estimerTrajetSansRoutage(depart, arrivee, profil);

    const data = (await reponse.json()) as {
      routes?: { distance?: number; duration?: number }[];
    };
    const route = data.routes?.[0];
    if (!route?.distance || !route?.duration) {
      return estimerTrajetSansRoutage(depart, arrivee, profil);
    }

    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      dureeMinutes: Math.max(1, Math.round(route.duration / 60)),
      source: "routage",
    };
  } catch {
    return estimerTrajetSansRoutage(depart, arrivee, profil);
  }
}

/** Profil de trajet correspondant au véhicule choisi pour la mission. */
export function profilPourVehicule(vehicule: string): ProfilTrajet {
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
  trajet: Pick<Trajet, "dureeMinutes">,
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
