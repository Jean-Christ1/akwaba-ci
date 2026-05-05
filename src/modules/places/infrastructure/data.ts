import type { City, Place, Itinerary } from "../domain/types";

import heroAbidjan from "@/assets/hero-abidjan.jpg";
import imgHotel from "@/assets/place-hotel-cocody.jpg";
import imgRestaurant from "@/assets/place-restaurant.jpg";
import imgAssinie from "@/assets/place-assinie.jpg";
import imgBassam from "@/assets/place-bassam.jpg";
import imgYakro from "@/assets/place-yamoussoukro.jpg";
import imgMaquis from "@/assets/place-maquis.jpg";
import imgPlateau from "@/assets/place-plateau.jpg";

export const CITIES: City[] = [
  {
    slug: "abidjan",
    name: "Abidjan",
    region: "Lagunes",
    tagline: "La capitale économique, vibrante et raffinée.",
    description:
      "Entre lagunes, gratte-ciels et quartiers d'artistes, Abidjan se vit en plusieurs adresses. Cocody pour le calme, le Plateau pour les affaires, Marcory et Zone 4 pour la nuit.",
    coords: { lat: 5.348, lng: -4.0083 },
    image: heroAbidjan,
  },
  {
    slug: "grand-bassam",
    name: "Grand-Bassam",
    region: "Sud-Comoé",
    tagline: "Patrimoine UNESCO, à 40 minutes d'Abidjan.",
    description:
      "Ancienne capitale coloniale classée à l'UNESCO. Architecture ocre, plages atlantiques et galeries d'artisans.",
    coords: { lat: 5.1986, lng: -3.7378 },
    image: imgBassam,
  },
  {
    slug: "assinie",
    name: "Assinie",
    region: "Sud-Comoé",
    tagline: "L'évasion balnéaire des Abidjanais.",
    description:
      "Cordon de sable entre lagune et océan, lodges discrets et restaurants en bord d'eau. À 1h30 d'Abidjan.",
    coords: { lat: 5.1333, lng: -3.2833 },
    image: imgAssinie,
  },
  {
    slug: "yamoussoukro",
    name: "Yamoussoukro",
    region: "Lacs",
    tagline: "La capitale politique, monumentale et apaisée.",
    description:
      "Ville pensée à grande échelle. La Basilique Notre-Dame de la Paix, plus grande basilique du monde, en est le symbole.",
    coords: { lat: 6.8276, lng: -5.2893 },
    image: imgYakro,
  },
];

export const PLACES: Place[] = [
  // ── Abidjan ─────────────────────────────────────────────────
  {
    id: "p-001",
    slug: "lodge-cocody-lagune",
    type: "lodging",
    name: "Lodge Cocody Lagune",
    tagline: "Boutique-hôtel discret face à la lagune.",
    description:
      "Vingt-quatre chambres signées par un architecte abidjanais, piscine à débordement et terrasse en teck. L'adresse choisie par les voyageurs qui veulent un séjour calme à dix minutes du Plateau.",
    story:
      "Ouvert en 2021 dans une ancienne résidence d'ambassade, le lodge a conservé les manguiers centenaires du jardin et travaille uniquement avec des artisans de Bingerville pour le mobilier.",
    city: "abidjan",
    zone: "Cocody",
    address: "Rue des Jardins, Cocody, Abidjan",
    coords: { lat: 5.358, lng: -3.998 },
    standing: 5,
    priceBand: "€€€€",
    hours: { open: true, today: "Réception 24h/24" },
    services: ["Piscine", "Spa", "Restaurant", "Wi-Fi", "Navette aéroport", "Parking sécurisé"],
    tags: ["Romantique", "Business", "Calme", "Vue lagune"],
    whyVisit: [
      "Architecture ivoirienne contemporaine et matériaux locaux.",
      "Piscine à débordement orientée coucher de soleil.",
      "Service personnalisé : 24 chambres, équipe stable.",
    ],
    bestFor: ["Couples", "Voyageurs d'affaires", "Premiers séjours premium"],
    bestTime: "Arrivée en fin d'après-midi pour profiter du sundowner.",
    averageDuration: "2 à 4 nuits",
    practicalTips: [
      "Demander une chambre côté lagune (étages 3 à 5).",
      "Le restaurant accueille aussi les non-résidents sur réservation.",
    ],
    phone: "+2252722441234",
    whatsapp: "+2250707070707",
    email: "reservations@lodgecocody.ci",
    image: imgHotel,
    premium: true,
    curatorNote: "Notre choix pour un premier séjour à Abidjan.",
  },
  {
    id: "p-002",
    slug: "le-comptoir-plateau",
    type: "restaurant",
    name: "Le Comptoir du Plateau",
    tagline: "Cuisine ivoirienne contemporaine, salle feutrée.",
    description:
      "Le chef revisite les classiques — kedjenou de pintade, sauce graine, attiéké de Dabou — avec une rigueur de fine dining. Carte des vins courte mais juste.",
    city: "abidjan",
    zone: "Plateau",
    address: "Boulevard de la République, Plateau, Abidjan",
    coords: { lat: 5.32, lng: -4.018 },
    standing: 4,
    priceBand: "€€€",
    hours: { open: true, today: "12:00 – 14:30 · 19:30 – 23:00" },
    services: ["Réservation", "Climatisation", "Carte des vins", "Voiturier"],
    tags: ["Fine dining", "Business", "Romantique"],
    cuisines: ["Ivoirienne contemporaine", "Française"],
    whyVisit: [
      "Une des rares tables où la cuisine ivoirienne est traitée avec ambition.",
      "Service discret, idéal pour un déjeuner d'affaires.",
      "Cave à vin pensée pour les plats du marché.",
    ],
    bestFor: ["Dîner romantique", "Déjeuner d'affaires", "Découverte culinaire"],
    bestTime: "Service du soir, demander une table près des baies vitrées.",
    averageDuration: "1h30 à 2h",
    practicalTips: ["Réserver 48h à l'avance le week-end.", "Tenue smart casual conseillée."],
    phone: "+2252720303030",
    whatsapp: "+2250505050505",
    image: imgRestaurant,
    premium: true,
  },
  {
    id: "p-003",
    slug: "maquis-allocodrome",
    type: "maquis",
    name: "Allocodrome de Zone 4",
    tagline: "L'expérience maquis, version sélection.",
    description:
      "Poisson braisé, alloco, attiéké et bières fraîches sous les guirlandes. Notre adresse préférée pour comprendre l'esprit Abidjanais sans concession au confort.",
    city: "abidjan",
    zone: "Marcory Zone 4",
    address: "Rue des Jasmins, Zone 4, Marcory",
    coords: { lat: 5.298, lng: -3.998 },
    standing: 3,
    priceBand: "€€",
    hours: { open: true, today: "18:00 – 02:00" },
    services: ["Terrasse", "Paiement mobile", "Live music week-end"],
    tags: ["Authentique", "Soirée", "Groupe"],
    cuisines: ["Ivoirienne", "Grillades"],
    whyVisit: [
      "Poisson choisi devant vous, braisé minute.",
      "Ambiance familiale dès 19h, plus festive après 22h.",
      "Prix justes pour la qualité.",
    ],
    bestFor: ["Soirée entre amis", "Découverte locale", "Voyageurs solo"],
    bestTime: "Vendredi et samedi soir pour la musique live.",
    averageDuration: "1h30 à 3h",
    phone: "+2250101020203",
    whatsapp: "+2250101020203",
    image: imgMaquis,
  },
  {
    id: "p-004",
    slug: "plateau-skyline",
    type: "attraction",
    name: "Skyline du Plateau",
    tagline: "Le Manhattan ouest-africain, vu de la lagune.",
    description:
      "La meilleure perspective sur les tours du Plateau s'admire depuis la rive de Cocody, ou en pirogue lagunaire au coucher du soleil.",
    city: "abidjan",
    zone: "Plateau",
    address: "Quai d'embarquement Cocody",
    coords: { lat: 5.34, lng: -4.01 },
    standing: 4,
    priceBand: "€",
    hours: { open: true, today: "Toute la journée" },
    services: ["Pirogue lagunaire (sur place)", "Photographie autorisée"],
    tags: ["Iconique", "Photo", "Coucher de soleil"],
    whyVisit: [
      "Vue panoramique unique en Afrique de l'Ouest.",
      "Traversée lagunaire abordable et dépaysante.",
      "Coucher de soleil sur les tours.",
    ],
    bestFor: ["Photographes", "Premier jour de séjour", "Familles"],
    bestTime: "17h30 — 18h30 (lumière dorée).",
    averageDuration: "1h",
    practicalTips: [
      "Négocier le prix de la pirogue avant de monter.",
      "Prévoir une casquette : peu d'ombre sur le quai.",
    ],
    image: imgPlateau,
  },
  // ── Grand-Bassam ────────────────────────────────────────────
  {
    id: "p-005",
    slug: "quartier-france-bassam",
    type: "culture",
    name: "Quartier France",
    tagline: "Le cœur historique classé UNESCO.",
    description:
      "Façades ocre des années 1890, anciens comptoirs commerciaux, musée du Costume. Une promenade architecturale rare en Afrique de l'Ouest.",
    story:
      "Première capitale de la Côte d'Ivoire coloniale, abandonnée après l'épidémie de fièvre jaune de 1899. Classé patrimoine mondial UNESCO en 2012.",
    city: "grand-bassam",
    zone: "Quartier France",
    address: "Avenue Treich Laplène, Grand-Bassam",
    coords: { lat: 5.197, lng: -3.738 },
    standing: 4,
    priceBand: "€",
    hours: { open: true, today: "Promenade libre · Musée 9h–17h" },
    services: ["Musée", "Galeries d'art", "Guide local sur demande"],
    tags: ["UNESCO", "Histoire", "Architecture"],
    whyVisit: [
      "Patrimoine architectural unique en Afrique de l'Ouest.",
      "Lumière exceptionnelle pour la photographie en fin d'après-midi.",
      "Concentration de galeries et ateliers d'artistes.",
    ],
    bestFor: ["Amateurs d'histoire", "Familles", "Première visite culturelle"],
    bestTime: "Matinée fraîche ou fin d'après-midi.",
    averageDuration: "2 à 3h",
    practicalTips: [
      "Prendre un guide local au musée (3 000 FCFA, négociable).",
      "Combiner avec un déjeuner les pieds dans le sable.",
    ],
    image: imgBassam,
    premium: true,
  },
  // ── Assinie ─────────────────────────────────────────────────
  {
    id: "p-006",
    slug: "lodge-assinie-lagune",
    type: "lodging",
    name: "Assinie Lagune Lodge",
    tagline: "Bungalows pieds dans l'eau, entre océan et lagune.",
    description:
      "Douze bungalows en bois sur la langue de sable d'Assinie. Restaurant en bord de lagune, kayaks, paddle et accès direct à la plage atlantique.",
    city: "assinie",
    zone: "Assinie-Mafia",
    address: "Route d'Assouindé, Assinie",
    coords: { lat: 5.135, lng: -3.282 },
    standing: 4,
    priceBand: "€€€",
    hours: { open: true, today: "Réception 7h – 22h" },
    services: ["Plage privée", "Kayaks", "Restaurant", "Wi-Fi", "Transferts"],
    tags: ["Bord de mer", "Romantique", "Famille"],
    whyVisit: [
      "Position rare entre lagune calme et océan vivant.",
      "Bungalows espacés, vraie tranquillité.",
      "Cuisine de mer au quotidien.",
    ],
    bestFor: ["Couples", "Familles", "Week-end depuis Abidjan"],
    bestTime: "Week-ends de novembre à mai (saison sèche).",
    averageDuration: "2 nuits idéales",
    practicalTips: [
      "Prévoir un transfert privé : la dernière section de route est cabossée.",
      "Réserver le restaurant en haute saison.",
    ],
    phone: "+2252721818181",
    whatsapp: "+2250606060606",
    image: imgAssinie,
    premium: true,
  },
  // ── Yamoussoukro ────────────────────────────────────────────
  {
    id: "p-007",
    slug: "basilique-notre-dame-paix",
    type: "culture",
    name: "Basilique Notre-Dame de la Paix",
    tagline: "Plus grande basilique du monde.",
    description:
      "Inspirée de Saint-Pierre de Rome, consacrée par Jean-Paul II en 1990. Coupole de 158 m, 7 000 m² de vitraux, esplanade monumentale.",
    city: "yamoussoukro",
    zone: "Centre",
    address: "Boulevard Houphouët-Boigny, Yamoussoukro",
    coords: { lat: 6.8104, lng: -5.2966 },
    standing: 5,
    priceBand: "€",
    hours: { open: true, today: "8h – 18h · Visites guidées 9h, 11h, 15h" },
    services: ["Visite guidée", "Boutique", "Parking"],
    tags: ["Iconique", "Architecture", "Spirituel"],
    whyVisit: [
      "Échelle architecturale unique sur le continent.",
      "Vitraux exceptionnels, en particulier au lever du soleil.",
      "Visite guidée structurée et claire.",
    ],
    bestFor: ["Premier voyage", "Familles", "Photographes"],
    bestTime: "Matinée pour la lumière sur les vitraux.",
    averageDuration: "1h30 à 2h",
    practicalTips: [
      "Tenue couvrant épaules et genoux exigée.",
      "Combiner avec le palais présidentiel et les caïmans sacrés.",
    ],
    image: imgYakro,
    premium: true,
  },
];

export const ITINERARIES: Itinerary[] = [
  {
    id: "i-001",
    slug: "abidjan-chic-48h",
    title: "Abidjan chic en 48 heures",
    subtitle: "L'essentiel de la capitale, sans stress.",
    city: "abidjan",
    durationHours: 48,
    budgetBand: "€€€",
    persona: "Premier séjour premium",
    image: imgPlateau,
    steps: [
      { position: 1, placeId: "p-001", suggestedTime: "Jour 1 · 16h", notes: "Check-in et sundowner au bord de la piscine." },
      { position: 2, placeId: "p-004", suggestedTime: "Jour 1 · 17h30", transportHint: "10 min en taxi privé.", notes: "Coucher de soleil sur le Plateau." },
      { position: 3, placeId: "p-002", suggestedTime: "Jour 1 · 20h", transportHint: "15 min en VTC.", notes: "Dîner gastronomique." },
      { position: 4, placeId: "p-003", suggestedTime: "Jour 2 · 19h30", notes: "Soirée locale en mode détendu." },
    ],
  },
  {
    id: "i-002",
    slug: "weekend-assinie",
    title: "Week-end à Assinie",
    subtitle: "Évasion balnéaire à 1h30 d'Abidjan.",
    city: "assinie",
    durationHours: 48,
    budgetBand: "€€€",
    persona: "Couple ou famille",
    image: imgAssinie,
    steps: [
      { position: 1, placeId: "p-006", suggestedTime: "Vendredi · 17h", transportHint: "Transfert privé recommandé.", notes: "Arrivée et apéritif face à la lagune." },
    ],
  },
  {
    id: "i-003",
    slug: "bassam-patrimoine",
    title: "Grand-Bassam patrimoine",
    subtitle: "Une journée entre histoire et plage.",
    city: "grand-bassam",
    durationHours: 8,
    budgetBand: "€€",
    persona: "Culture & famille",
    image: imgBassam,
    steps: [
      { position: 1, placeId: "p-005", suggestedTime: "10h", notes: "Visite guidée du Quartier France." },
    ],
  },
  {
    id: "i-004",
    slug: "yamoussoukro-monumental",
    title: "Yamoussoukro monumental",
    subtitle: "L'autre capitale, à voir au moins une fois.",
    city: "yamoussoukro",
    durationHours: 24,
    budgetBand: "€€",
    persona: "Voyageur curieux",
    image: imgYakro,
    steps: [
      { position: 1, placeId: "p-007", suggestedTime: "9h", notes: "Visite guidée de la basilique." },
    ],
  },
];

export function getPlaceBySlug(slug: string) {
  return PLACES.find((p) => p.slug === slug);
}
export function getCityBySlug(slug: string) {
  return CITIES.find((c) => c.slug === slug);
}
export function getItineraryBySlug(slug: string) {
  return ITINERARIES.find((i) => i.slug === slug);
}
export function getPlacesByIds(ids: string[]) {
  return ids.map((id) => PLACES.find((p) => p.id === id)).filter(Boolean) as typeof PLACES;
}
