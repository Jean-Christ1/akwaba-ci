import type { Database } from "@/integrations/supabase/types";

export type ErrandStatus = Database["public"]["Enums"]["errand_status"];
export type ErrandCategory = Database["public"]["Enums"]["errand_category"];
export type PayMethod = Database["public"]["Enums"]["pay_method"];
export type RunnerStatus = Database["public"]["Enums"]["runner_status"];

export interface ErrandItem {
  label: string;
  qty: string;
  note?: string;
}

export const CATEGORIES: { value: ErrandCategory; label: string; emoji: string; hint: string }[] = [
  { value: "grocery", label: "Supermarché", emoji: "🛒", hint: "Prosuma, Carrefour, Sococé…" },
  { value: "market", label: "Marché", emoji: "🧺", hint: "Adjamé, Cocody, Treichville…" },
  { value: "pharmacy", label: "Pharmacie", emoji: "💊", hint: "Ordonnance, garde de nuit" },
  { value: "restaurant", label: "Restaurant / Maquis", emoji: "🍽️", hint: "Plats à emporter" },
  { value: "artisan", label: "Artisan / Service", emoji: "🔧", hint: "Plombier, couturier, coiffure" },
  { value: "admin_paperwork", label: "Démarches", emoji: "📄", hint: "Mairie, CNPS, dépôt de dossier" },
  { value: "gas", label: "Gaz / Eau", emoji: "🔥", hint: "Bouteille de gaz, packs d'eau" },
  { value: "electronics", label: "Électronique", emoji: "📱", hint: "Accessoires, réparation" },
  { value: "other", label: "Autre", emoji: "✨", hint: "Décrivez votre besoin" },
];

export const CITIES = [
  "Abidjan",
  "Grand-Bassam",
  "Assinie",
  "Yamoussoukro",
  "Bouaké",
  "San-Pédro",
  "Korhogo",
  "Daloa",
];

export const ABIDJAN_ZONES = [
  "Cocody",
  "Plateau",
  "Marcory",
  "Treichville",
  "Yopougon",
  "Abobo",
  "Adjamé",
  "Koumassi",
  "Port-Bouët",
  "Bingerville",
  "Songon",
  "Attécoubé",
];

export const VEHICLES = [
  { value: "a_pied", label: "À pied" },
  { value: "moto", label: "Moto" },
  { value: "tricycle", label: "Tricycle" },
  { value: "voiture", label: "Voiture" },
  { value: "camionnette", label: "Camionnette" },
];

export const PAY_METHODS: { value: PayMethod; label: string; emoji: string }[] = [
  { value: "wave", label: "Wave", emoji: "🌊" },
  { value: "orange_money", label: "Orange Money", emoji: "🟠" },
  { value: "mtn_momo", label: "MTN MoMo", emoji: "🟡" },
  { value: "moov_money", label: "Moov Money", emoji: "🔵" },
  { value: "cash", label: "Espèces à la livraison", emoji: "💵" },
  { value: "card", label: "Carte bancaire", emoji: "💳" },
];

export const STATUS_LABEL: Record<ErrandStatus, string> = {
  draft: "Brouillon",
  open: "En recherche de shopper",
  assigned: "Shopper assigné",
  shopping: "Courses en cours",
  delivering: "En livraison",
  delivered: "Livrée",
  completed: "Terminée & payée",
  cancelled: "Annulée",
  disputed: "Litige",
};

export const STATUS_STEPS: ErrandStatus[] = [
  "open",
  "assigned",
  "shopping",
  "delivering",
  "delivered",
  "completed",
];

export const COMMISSION_RATE = 0.1;

export function formatFcfa(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

export interface InvoiceInput {
  itemsTotal: number;
  serviceFee: number;
  deliveryFee: number;
  commissionRate?: number;
}

export function computeInvoice({
  itemsTotal,
  serviceFee,
  deliveryFee,
  commissionRate = COMMISSION_RATE,
}: InvoiceInput) {
  const items = Math.max(0, Number(itemsTotal) || 0);
  const service = Math.max(0, Number(serviceFee) || 0);
  const delivery = Math.max(0, Number(deliveryFee) || 0);
  const commission = Math.round((service + delivery) * commissionRate);
  const total = items + service + delivery;
  const runnerPayout = service + delivery - commission;
  return { items, service, delivery, commission, total, runnerPayout, commissionRate };
}

export function statusTone(status: ErrandStatus) {
  switch (status) {
    case "completed":
    case "delivered":
      return "bg-primary-soft text-primary";
    case "cancelled":
    case "disputed":
      return "bg-destructive/10 text-destructive";
    case "open":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-accent text-accent-foreground";
  }
}

export function waLink(phone?: string | null, text?: string) {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
