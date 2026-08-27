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

/**
 * Ce qui s'affiche pour choisir un véhicule. Les tarifs n'y figurent plus :
 * ils vivent dans `pricing_rules`, lus par `usePricingGrid`. Les garder ici
 * aurait recréé la deuxième source qu'on vient de supprimer.
 */
export const VEHICLE_OPTIONS: {
  value: VehicleKind;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  { value: "any", label: "Peu importe", emoji: "🤝", hint: "Le shopper choisit" },
  { value: "a_pied", label: "À pied", emoji: "🚶", hint: "Petites courses de quartier" },
  { value: "moto", label: "Moto", emoji: "🛵", hint: "Rapide, sacs légers" },
  { value: "tricycle", label: "Tricycle", emoji: "🛺", hint: "Gros sacs, packs d'eau" },
  { value: "voiture", label: "Voiture", emoji: "🚗", hint: "Courses volumineuses, fragile" },
  { value: "camionnette", label: "Camionnette", emoji: "🚚", hint: "Quincaillerie, meubles, gros volume" },
];

export const VOLUME_OPTIONS: { value: VolumeSize; label: string; hint: string }[] = [
  { value: "small", label: "Petit", hint: "1 sac, tient sur une moto" },
  { value: "medium", label: "Moyen", hint: "2 à 4 sacs" },
  { value: "large", label: "Grand", hint: "Plein coffre, pack d'eau, gaz" },
  { value: "xl", label: "Très grand", hint: "Camionnette nécessaire" },
];

export const URGENCY_OPTIONS: { value: Urgency; label: string; hint: string }[] = [
  { value: "scheduled", label: "Planifié", hint: "À une date/heure choisie" },
  { value: "standard", label: "Aujourd'hui", hint: "Dans la journée" },
  { value: "express", label: "Express", hint: "Sous 1 h, priorité maximale" },
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
export const MIN_PAYOUT = 2000;
export const RUNNER_ADVANCE_CAP = 50000;

/**
 * Le devis se calcule désormais dans `grilleTarifaire.ts`, à partir de la
 * grille publiée en base. Ce fichier ne décrit plus que ce qui s'affiche et
 * les deux seuils du barème de commission, qui vivent dans une autre table.
 */

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
