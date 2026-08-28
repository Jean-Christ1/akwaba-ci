import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Majoration } from "@/modules/errands/grilleTarifaire";

/**
 * La majoration exceptionnelle en cours, s'il y en a une.
 *
 * Elle ne se déduit pas de la grille tarifaire : elle dépend de l'heure et de
 * la ville, et seul le serveur sait si elle court. Elle se relit donc quand la
 * ville change, séparément du barème, qui lui ne bouge pas.
 *
 * Son absence n'est pas une erreur, c'est le cas courant : la plupart du temps
 * il n'y a pas de majoration, et l'écran ne doit rien afficher.
 *
 * Elle est lue avant que le client ne commande, et affichée avec son motif. Un
 * supplément découvert après coup n'est pas un prix, c'est une surprise.
 */
export function useMajoration(citySlug?: string | null): {
  majoration: Majoration | null;
  chargement: boolean;
} {
  const [majoration, setMajoration] = useState<Majoration | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    setChargement(true);

    supabase.rpc("surge_en_vigueur", { p_city: citySlug ?? null }).then(({ data }) => {
      if (annule) return;
      setChargement(false);
      const ligne = Array.isArray(data) ? data[0] : null;
      setMajoration(
        ligne
          ? {
              multiplicateur: Number(ligne.multiplicateur),
              motif: String(ligne.motif),
              fin: String(ligne.fin),
            }
          : null
      );
    });

    return () => {
      annule = true;
    };
  }, [citySlug]);

  return { majoration, chargement };
}

export default useMajoration;
