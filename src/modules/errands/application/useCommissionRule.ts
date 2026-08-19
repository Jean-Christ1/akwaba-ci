import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  COMMISSION_RATE,
  MIN_PAYOUT,
  MIN_SERVICE_FEE,
} from "@/modules/errands/pricing";

export interface CommissionRule {
  version: number;
  base: "service_fee" | "service_and_delivery";
  rate: number;
  minServiceFee: number;
  minPayout: number;
  holdHours: number;
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
      .select("version,rate,base,min_service_fee,min_payout,hold_hours")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (annule || !data) return;
        setRule({
          version: Number(data.version),
          base: data.base === "service_and_delivery" ? "service_and_delivery" : "service_fee",
          rate: Number(data.rate),
          minServiceFee: Number(data.min_service_fee),
          minPayout: Number(data.min_payout),
          holdHours: Number(data.hold_hours),
        });
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
