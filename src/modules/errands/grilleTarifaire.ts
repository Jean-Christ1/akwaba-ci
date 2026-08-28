/**
 * Le barème, tel que la base le publie.
 *
 * Les tarifs étaient écrits deux fois : en TypeScript pour l'écran, en
 * PL/pgSQL pour le serveur. Un script de parité les comparait après coup, ce
 * qui suppose que quelqu'un le lance et qu'il le lance à temps. Ils ne sont
 * plus écrits qu'une fois, dans `pricing_rules`, et ce module les lit.
 *
 * La conséquence pratique compte : relever le prix du kilomètre se fait
 * désormais depuis la console, sans reconstruire ni redéployer l'application.
 */

export interface TarifVehicule {
  base: number;
  perKm: number;
}

export interface TarifVille {
  baseMultiplier: number;
  perKmMultiplier: number;
  /** Plancher propre à la ville. Absent : celui du barème de commission. */
  minServiceFee: number | null;
}

export interface GrilleTarifaire {
  ruleId: string;
  version: number;
  label: string;
  freeMinutes: number;
  perMinute: number;
  itemsIncluded: number;
  perExtraItem: number;
  roundingStep: number;
  volume: Record<string, number>;
  urgency: Record<string, number>;
  dropoff: Record<string, number>;
  vehicles: Record<string, TarifVehicule>;
  cities: Record<string, TarifVille>;
  commission: { rate: number; minServiceFee: number };
}

const nombre = (v: unknown, defaut = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaut;
};

/**
 * Traduction de ce que rend `active_pricing_grid()`.
 *
 * PostgreSQL rend ses numériques tantôt en nombre, tantôt en chaîne selon le
 * chemin de sérialisation. Tout passe donc par une conversion explicite :
 * additionner une chaîne concatènerait au lieu d'ajouter, et le devis serait
 * faux sans qu'aucune erreur ne soit levée.
 */
export function lireGrille(brut: unknown): GrilleTarifaire | null {
  if (!brut || typeof brut !== "object") return null;
  const g = brut as Record<string, unknown>;
  if (!g.ruleId || !g.vehicles) return null;

  const table = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
      out[k] = nombre(val);
    }
    return out;
  };

  const vehicles: Record<string, TarifVehicule> = {};
  for (const [k, v] of Object.entries(g.vehicles as Record<string, unknown>)) {
    const t = (v ?? {}) as Record<string, unknown>;
    vehicles[k] = { base: nombre(t.base), perKm: nombre(t.perKm) };
  }

  const cities: Record<string, TarifVille> = {};
  for (const [k, v] of Object.entries((g.cities ?? {}) as Record<string, unknown>)) {
    const t = (v ?? {}) as Record<string, unknown>;
    cities[k] = {
      baseMultiplier: nombre(t.baseMultiplier, 1),
      perKmMultiplier: nombre(t.perKmMultiplier, 1),
      minServiceFee: t.minServiceFee == null ? null : nombre(t.minServiceFee),
    };
  }

  const commission = (g.commission ?? {}) as Record<string, unknown>;

  return {
    ruleId: String(g.ruleId),
    version: nombre(g.version),
    label: String(g.label ?? ""),
    freeMinutes: nombre(g.freeMinutes, 30),
    perMinute: nombre(g.perMinute, 0),
    itemsIncluded: nombre(g.itemsIncluded, 10),
    perExtraItem: nombre(g.perExtraItem, 0),
    // Un pas d'arrondi nul ferait une division par zéro et un devis NaN.
    roundingStep: Math.max(1, nombre(g.roundingStep, 50)),
    volume: table(g.volume),
    urgency: table(g.urgency),
    dropoff: table(g.dropoff),
    vehicles,
    cities,
    commission: {
      rate: nombre(commission.rate),
      minServiceFee: nombre(commission.minServiceFee),
    },
  };
}

export interface EntreeDevis {
  vehicle: string;
  volume: string;
  urgency: string;
  dropoff: string;
  distanceKm: number;
  estimatedMinutes: number;
  itemsCount?: number;
  /** Identifiant de la ville. Absent ou inconnu : coefficients neutres. */
  citySlug?: string | null;
}

/**
 * Une majoration exceptionnelle en cours.
 *
 * Elle ne se déduit pas de la grille : elle dépend de l'heure et de la ville, et
 * seul le serveur sait si elle court. Elle arrive donc à part, et vaut 1 quand
 * il n'y en a pas.
 */
export interface Majoration {
  multiplicateur: number;
  motif: string;
  fin: string;
}

export interface Devis {
  base: number;
  distanceFee: number;
  timeFee: number;
  volumeFee: number;
  urgencyFee: number;
  itemsFee: number;
  dropoffAdjustment: number;
  /** Le tarif avant majoration : c'est sur lui que porte la commission. */
  serviceFeeBeforeSurge: number;
  surgeFee: number;
  surgeReason: string | null;
  serviceFee: number;
  commission: number;
  runnerPayout: number;
}

/**
 * Le devis, calculé comme `pricing_quote` le calcule.
 *
 * La formule reste écrite deux fois, mais plus les nombres. Le contrôle de
 * parité veille sur la formule ; la base veille sur les tarifs.
 */
export function devisDepuisGrille(
  e: EntreeDevis,
  g: GrilleTarifaire,
  majoration?: Majoration | null
): Devis {
  const v = g.vehicles[e.vehicle] ?? g.vehicles.any ?? { base: 0, perKm: 0 };
  const ville = (e.citySlug && g.cities[e.citySlug]) || null;
  const multBase = ville?.baseMultiplier ?? 1;
  const multKm = ville?.perKmMultiplier ?? 1;

  const base = v.base * multBase;
  const distanceFee = Math.max(0, e.distanceKm) * v.perKm * multKm;
  const timeFee = Math.max(0, (e.estimatedMinutes || 0) - g.freeMinutes) * g.perMinute;
  const volumeFee = g.volume[e.volume] ?? 0;
  const urgencyFee = g.urgency[e.urgency] ?? 0;
  const itemsFee = Math.max(0, (e.itemsCount ?? 0) - g.itemsIncluded) * g.perExtraItem;
  const dropoffAdjustment = g.dropoff[e.dropoff] ?? 0;

  const brut = base + distanceFee + timeFee + volumeFee + urgencyFee + itemsFee + dropoffAdjustment;
  const plancher = ville?.minServiceFee ?? g.commission.minServiceFee;
  const avant = Math.max(Math.round(brut / g.roundingStep) * g.roundingStep, plancher);

  // La majoration s'ajoute au tarif arrondi et s'arrondit au même pas : un
  // supplément de 137 francs sur un prix qui va de cent en cent donnerait un
  // total qu'on ne saurait pas lire.
  const mult = majoration?.multiplicateur ?? 1;
  const surgeFee =
    mult > 1 ? Math.round((avant * (mult - 1)) / g.roundingStep) * g.roundingStep : 0;
  const serviceFee = avant + surgeFee;

  // La commission porte sur le tarif d'avant majoration. Le supplément revient
  // entièrement au shopper : il existe pour le convaincre de sortir, pas pour
  // enrichir la plateforme d'une pénurie.
  const commission = Math.round(avant * g.commission.rate * 100) / 100;

  return {
    base,
    distanceFee,
    timeFee,
    volumeFee,
    urgencyFee,
    itemsFee,
    dropoffAdjustment,
    serviceFeeBeforeSurge: avant,
    surgeFee,
    surgeReason: surgeFee > 0 ? (majoration?.motif ?? null) : null,
    serviceFee,
    commission,
    runnerPayout: serviceFee - commission,
  };
}
