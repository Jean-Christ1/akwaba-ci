import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lireGrille, type GrilleTarifaire } from "@/modules/errands/grilleTarifaire";

/**
 * Le barème en vigueur, lu une fois.
 *
 * Le composeur chiffre à chaque frappe. Un aller-retour par frappe rendrait
 * l'écran inutilisable, donc la grille est chargée entière et le calcul se
 * fait dans le navigateur avec les tarifs du serveur.
 *
 * Il n'y a délibérément aucune valeur de repli. Une grille de secours écrite
 * dans le code redeviendrait ce qu'on vient de supprimer : une deuxième source
 * de tarifs, qui vieillit en silence et finit par annoncer au client un prix
 * que le serveur n'appliquera pas. Mieux vaut dire que le tarif est
 * indisponible que d'en afficher un faux.
 */
export function usePricingGrid(): {
  grille: GrilleTarifaire | null;
  chargement: boolean;
  erreur: string | null;
} {
  const [grille, setGrille] = useState<GrilleTarifaire | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;

    supabase.rpc("active_pricing_grid").then(({ data, error }) => {
      if (annule) return;
      setChargement(false);
      if (error) return setErreur(error.message);
      const lue = lireGrille(data);
      if (!lue) return setErreur("Aucun barème tarifaire n'est publié.");
      setGrille(lue);
    });

    return () => {
      annule = true;
    };
  }, []);

  return { grille, chargement, erreur };
}

export default usePricingGrid;
