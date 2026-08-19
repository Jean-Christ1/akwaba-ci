import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  COMMISSION_RATE,
  MIN_PAYOUT,
  MIN_SERVICE_FEE,
} from "@/modules/errands/pricing";

/**
 * Qui paie le shopper. En « direct », le client le règle lui-même et la
 * commission reste due à la plateforme ; en « escrow », la plateforme encaisse
 * puis lui verse ses gains. Le portefeuille n'a de retrait à proposer que dans
 * le second cas.
 */
export type SettlementMode = "direct" | "escrow";

export interface CommissionRule {
  version: number;
  base: "service_fee" | "service_and_delivery";
  settlement: SettlementMode;
  rate: number;
  minServiceFee: number;
  minPayout: number;
  holdHours: number;
}

/**
 * Ligne de barème telle que la requête la rapporte. Les numériques Postgres
 * peuvent revenir en chaîne selon la colonne, d'où la conversion systématique.
 */
export interface CommissionRuleRow {
  version: number | string;
  base: string;
  settlement: string;
  rate: number | string;
  min_service_fee: number | string;
  min_payout: number | string;
  hold_hours: number | string;
}

/**
 * Traduction d'une ligne de barème.
 *
 * Le mode de règlement n'était pas lu, si bien que le portefeuille du shopper
 * proposait un retrait que la base ne pouvait jamais honorer. Une valeur
 * inattendue retombe sur « direct », qui est la valeur par défaut de la
 * colonne et le choix prudent : mieux vaut ne pas promettre un retrait que
 * d'en promettre un qui sera refusé.
 */
export function toCommissionRule(row: CommissionRuleRow): CommissionRule {
  return {
    version: Number(row.version),
    base: row.base === "service_and_delivery" ? "service_and_delivery" : "service_fee",
    settlement: row.settlement === "escrow" ? "escrow" : "direct",
    rate: Number(row.rate),
    minServiceFee: Number(row.min_service_fee),
    minPayout: Number(row.min_payout),
    holdHours: Number(row.hold_hours),
  };
}

/**
 * Barème en vigueur.
 *
 * Le serveur fait autorité sur les montants : il calcule le devis, la
 * commission et le seuil de retrait à partir de la table `commission_rules`.
 * L'affichage doit donc lire le même barème, sinon le prix annoncé au client
 * finirait par diverger de celui qui lui est réellement appliqué.
 *
 * Les constantes du moteur tarifaire restent la valeur de repli, le temps que
 * la requête aboutisse ou si elle échoue : mieux vaut un ordre de grandeur
 * cohérent qu'un écran sans prix.
 */
const REPLI: CommissionRule = {
  version: 0,
  base: "service_fee",
  settlement: "direct",
  rate: COMMISSION_RATE,
  minServiceFee: MIN_SERVICE_FEE,
  minPayout: MIN_PAYOUT,
  holdHours: 24,
};

export function useCommissionRule(): { rule: CommissionRule; loading: boolean } {
  const [rule, setRule] = useState<CommissionRule>(REPLI);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;

    supabase
      .from("commission_rules")
      .select("version,rate,base,settlement,min_service_fee,min_payout,hold_hours")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (annule || !data) return;
        setRule(toCommissionRule(data));
      })
      .then(() => {
        if (!annule) setLoading(false);
      });

    return () => {
      annule = true;
    };
  }, []);

  return { rule, loading };
}

export default useCommissionRule;
