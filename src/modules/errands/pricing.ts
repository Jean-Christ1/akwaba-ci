// ============================================================
// Moteur tarifaire Akwaba Courses
// Règle d'or : on sépare TOUJOURS deux flux d'argent
//   1. L'ARGENT DES ACHATS  -> 100 % pour le marchand, jamais commissionné
//   2. LES FRAIS DE SERVICE -> rémunération du shopper + commission Akwaba
// ============================================================

export type VehicleKind = "any" | "a_pied" | "moto" | "tricycle" | "voiture" | "camionnette";
export type VolumeSize = "small" | "medium" | "large" | "xl";
export type Urgency = "scheduled" | "standard" | "express";
export type FundMode = "customer_advance" | "runner_advance" | "on_delivery";
export type DropoffMode = "runner_delivers" | "third_party" | "customer_pickup";
export type MomoProvider = "wave" | "orange_money" | "mtn_momo" | "moov_money" | "bank";

export const VEHICLE_OPTIONS: {
  value: VehicleKind;
  label: string;
  emoji: string;
  hint: string;
  base: number;
  perKm: number;
}[] = [
  { value: "any", label: "Peu importe", emoji: "🤝", hint: "Le shopper choisit", base: 700, perKm: 120 },
  { value: "a_pied", label: "À pied", emoji: "🚶", hint: "Petites courses de quartier", base: 500, perKm: 100 },
  { value: "moto", label: "Moto", emoji: "🛵", hint: "Rapide, sacs légers", base: 700, perKm: 130 },
  { value: "tricycle", label: "Tricycle", emoji: "🛺", hint: "Gros sacs, packs d'eau", base: 1200, perKm: 160 },
  { value: "voiture", label: "Voiture", emoji: "🚗", hint: "Courses volumineuses, fragile", base: 1500, perKm: 200 },
  { value: "camionnette", label: "Camionnette", emoji: "🚚", hint: "Quincaillerie, meubles, gros volume", base: 3000, perKm: 300 },
];

export const VOLUME_OPTIONS: { value: VolumeSize; label: string; hint: string; fee: number }[] = [
  { value: "small", label: "Petit", hint: "1 sac, tient sur une moto", fee: 0 },
  { value: "medium", label: "Moyen", hint: "2 à 4 sacs", fee: 500 },
  { value: "large", label: "Grand", hint: "Plein coffre, pack d'eau, gaz", fee: 1500 },
  { value: "xl", label: "Très grand", hint: "Camionnette nécessaire", fee: 3000 },
];

export const URGENCY_OPTIONS: { value: Urgency; label: string; hint: string; fee: number }[] = [
  { value: "scheduled", label: "Planifié", hint: "À une date/heure choisie", fee: 0 },
  { value: "standard", label: "Aujourd'hui", hint: "Dans la journée", fee: 0 },
  { value: "express", label: "Express", hint: "Sous 1 h, priorité maximale", fee: 1000 },
];

export const FUND_MODES: { value: FundMode; label: string; hint: string; badge: string }[] = [
  {
    value: "customer_advance",
    label: "J'envoie l'argent des achats d'avance",
    hint: "Vous transférez le budget estimé sur le compte Wave/Orange Money du shopper avant qu'il parte. À la fin, on régularise au franc près avec le reçu.",
    badge: "Recommandé",
  },
  {
    value: "runner_advance",
    label: "Le shopper avance l'argent",
    hint: "Réservé aux shoppers vérifiés (plafond 50 000 FCFA). Vous remboursez à la livraison, reçu à l'appui.",
    badge: "Shoppers vérifiés",
  },
  {
    value: "on_delivery",
    label: "Je paie tout à la livraison",
    hint: "Pour les courses sans avance : retrait de colis, démarche, service d'artisan.",
    badge: "Sans achat",
  },
];

export const DROPOFF_MODES: { value: DropoffMode; label: string; hint: string }[] = [
  { value: "runner_delivers", label: "Le shopper me livre", hint: "Il fait la course et dépose chez vous" },
  { value: "third_party", label: "Il confie à un livreur (nyango, gbaka…)", hint: "Le shopper fait la course, un tiers dépose. Frais de livraison réduits." },
  { value: "customer_pickup", label: "Je viens récupérer", hint: "Le shopper garde la course, vous passez la prendre" },
];

export const MOMO_PROVIDERS: { value: MomoProvider; label: string; emoji: string }[] = [
  { value: "wave", label: "Wave", emoji: "🌊" },
  { value: "orange_money", label: "Orange Money", emoji: "🟠" },
  { value: "mtn_momo", label: "MTN MoMo", emoji: "🟡" },
  { value: "moov_money", label: "Moov Money", emoji: "🔵" },
  { value: "bank", label: "Virement bancaire", emoji: "🏦" },
];

/** Commission Akwaba : uniquement sur les frais de service, jamais sur les achats. */
export const COMMISSION_RATE = 0.15;
export const MIN_SERVICE_FEE = 1000;
export const FREE_MINUTES = 30;
export const PER_MINUTE = 10;
export const MIN_PAYOUT = 2000;
export const RUNNER_ADVANCE_CAP = 50000;

export interface QuoteInput {
  vehicle: VehicleKind;
  volume: VolumeSize;
  urgency: Urgency;
  distanceKm: number;
  estimatedMinutes: number;
  dropoff: DropoffMode;
  itemsCount?: number;
  /**
   * Barème en vigueur, lu dans `commission_rules`. Les constantes ne sont
   * que le repli : un exploitant qui publie un nouveau barème changerait le
   * prix appliqué par le serveur sans changer celui annoncé à l'écran.
   */
  minServiceFee?: number;
  commissionRate?: number;
}

export interface Quote {
  base: number;
  distanceFee: number;
  timeFee: number;
  volumeFee: number;
  urgencyFee: number;
  itemsFee: number;
  dropoffAdjustment: number;
  serviceFee: number;
  commission: number;
  runnerPayout: number;
}

const round50 = (n: number) => Math.round(n / 50) * 50;

export function quoteErrand(input: QuoteInput): Quote {
  const minServiceFee = input.minServiceFee ?? MIN_SERVICE_FEE;
  const commissionRate = input.commissionRate ?? COMMISSION_RATE;
  const v = VEHICLE_OPTIONS.find((o) => o.value === input.vehicle) ?? VEHICLE_OPTIONS[0];
  const vol = VOLUME_OPTIONS.find((o) => o.value === input.volume) ?? VOLUME_OPTIONS[0];
  const urg = URGENCY_OPTIONS.find((o) => o.value === input.urgency) ?? URGENCY_OPTIONS[1];

  const base = v.base;
  // Aucun arrondi sur les composantes : le serveur somme les valeurs exactes
  // et n'arrondit qu'une fois. Arrondir ici puis à nouveau sur le total
  // faisait diverger le devis annoncé du montant enregistré, d'un pas de
  // cinquante francs, dans un cas sur quatre.
  const distanceFee = Math.max(0, input.distanceKm) * v.perKm;
  const extraMinutes = Math.max(0, (input.estimatedMinutes || 0) - FREE_MINUTES);
  const timeFee = extraMinutes * PER_MINUTE;
  const volumeFee = vol.fee;
  const urgencyFee = urg.fee;
  // Longue liste = plus de temps en rayon
  const itemsFee = Math.max(0, (input.itemsCount ?? 0) - 10) * 50;
  const dropoffAdjustment =
    input.dropoff === "customer_pickup" ? -500 : input.dropoff === "third_party" ? -300 : 0;

  const raw = base + distanceFee + timeFee + volumeFee + urgencyFee + itemsFee + dropoffAdjustment;
  const serviceFee = Math.max(minServiceFee, round50(raw));
  // La commission doit être arrondie exactement comme le serveur l'arrondit,
  // sinon le client lit un montant et la base en enregistre un autre. Le
  // serveur fait round(service * taux, 2) : on reproduit cela au centime, et
  // surtout pas l'arrondi à cinquante francs utilisé pour les frais eux-mêmes.
  const commission = Math.round(serviceFee * commissionRate * 100) / 100;
  const runnerPayout = serviceFee - commission;

  return {
    base,
    distanceFee,
    timeFee,
    volumeFee,
    urgencyFee,
    itemsFee,
    dropoffAdjustment,
    serviceFee,
    commission,
    runnerPayout,
  };
}

/** Régularisation finale : ce que le client doit encore (ou récupère). */
export function settle(params: {
  advanceAmount: number;
  actualItemsTotal: number;
  serviceFee: number;
  tip?: number;
}) {
  const tip = Math.max(0, params.tip ?? 0);
  const purchases = Math.max(0, params.actualItemsTotal);
  const due = purchases + params.serviceFee + tip - Math.max(0, params.advanceAmount);
  return {
    purchases,
    tip,
    grandTotal: purchases + params.serviceFee + tip,
    balanceDue: Math.max(0, due),
    refundToCustomer: Math.max(0, -due),
  };
}

export function generateHandoverCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
