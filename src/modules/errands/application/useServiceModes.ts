import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { ErrandCategory } from "@/modules/errands/domain";
import type { FundMode } from "@/modules/errands/pricing";

export interface ModeDeCourse {
  code: ErrandCategory;
  libelle: string;
  emoji: string;
  exemple: string;
  description: string | null;
  modes_financement: FundMode[];
  exige_panier_valide: boolean;
}

/**
 * Les types de course réellement ouverts, tels que le serveur les donne.
 *
 * Le catalogue vivait dans une constante du code. Fermer une catégorie, le
 * temps d'une pénurie de gaz ou d'un marché en travaux, demandait alors une
 * livraison de l'application : personne ne le faisait, et la course partait
 * quand même vers un commerce fermé.
 *
 * La liste dépend de la ville : une catégorie peut être ouverte à Abidjan et
 * fermée à Korhogo, où il n'y a pas encore de shopper pour la tenir.
 *
 * Il n'y a délibérément aucune liste de repli. Une liste de secours écrite dans
 * le code redeviendrait ce qu'on vient de supprimer : une deuxième source, qui
 * vieillit en silence et propose une catégorie que le serveur refusera à la
 * publication. Mieux vaut dire que le catalogue est indisponible.
 */
export function useServiceModes(ville?: string | null): {
  modes: ModeDeCourse[] | null;
  chargement: boolean;
  erreur: string | null;
} {
  const [modes, setModes] = useState<ModeDeCourse[] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setChargement(true);

    supabase
      .rpc("service_modes_ouverts", { p_ville: ville ?? null })
      .then(({ data, error }) => {
        if (annule) return;
        setChargement(false);
        if (error) {
          setErreur(error.message);
          return;
        }
        setErreur(null);
        setModes((data ?? []) as ModeDeCourse[]);
      });

    return () => {
      annule = true;
    };
  }, [ville]);

  return { modes, chargement, erreur };
}

/**
 * Le mode retenu reste-t-il proposable ?
 *
 * Changer de ville peut fermer la catégorie déjà choisie. Laisser la sélection
 * en place enverrait le client jusqu'au bout du formulaire pour se faire
 * refuser à l'envoi, sans comprendre pourquoi.
 */
export function modeEncoreOuvert(
  modes: ModeDeCourse[] | null,
  code: ErrandCategory
): boolean {
  if (!modes) return true;
  return modes.some((m) => m.code === code);
}

/**
 * Les règlements proposés pour une catégorie.
 *
 * Un retrait de colis n'a rien à acheter : proposer d'y avancer de l'argent
 * ferait poser au client une question sans objet, et le serveur refuserait.
 */
export function reglementsDe(
  modes: ModeDeCourse[] | null,
  code: ErrandCategory
): FundMode[] | null {
  const mode = modes?.find((m) => m.code === code);
  return mode ? mode.modes_financement : null;
}

export default useServiceModes;
