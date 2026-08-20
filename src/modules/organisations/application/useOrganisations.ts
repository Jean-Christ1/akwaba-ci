import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "manager" | "member";

export interface Organisation {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface OrganisationMembre {
  user_id: string;
  role: OrgRole;
  joined_at: string;
  nom: string;
}

export interface CourseOrganisation {
  id: string;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  service_fee: number;
  created_at: string;
  demandeur: string;
}

/**
 * Les organisations d'une personne, et ce qu'elle y voit.
 *
 * La lecture passe par les tables pour les organisations et leurs membres, dont
 * les politiques réservent déjà les lignes aux membres, et par une fonction pour
 * les courses. Ce détour n'est pas une commodité : l'adresse de remise et les
 * notes du client sont lisibles colonne par colonne dès que la ligne de course
 * l'est, et un collègue n'a pas à lire l'adresse personnelle d'un autre. La
 * fonction ne rend que le suivi et les montants.
 */
export function useOrganisations(userId: string | undefined) {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [roles, setRoles] = useState<Record<string, OrgRole>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!userId) {
      setOrganisations([]);
      setRoles({});
      setChargement(false);
      return;
    }
    setChargement(true);

    const [{ data: appartenances, error: erreurMembres }, { data: fiches, error: erreurOrgs }] =
      await Promise.all([
        supabase.from("organisation_members").select("organisation_id,role").eq("user_id", userId),
        supabase
          .from("organisations")
          .select("id,name,contact_email,contact_phone,created_at")
          .order("name"),
      ]);

    setChargement(false);

    const echec = erreurMembres ?? erreurOrgs;
    if (echec) {
      setErreur(echec.message);
      return;
    }
    setErreur(null);

    const parOrg: Record<string, OrgRole> = {};
    for (const a of appartenances ?? []) parOrg[a.organisation_id] = a.role as OrgRole;
    setRoles(parOrg);
    setOrganisations((fiches ?? []) as Organisation[]);
  }, [userId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  return { organisations, roles, chargement, erreur, recharger: charger };
}

/**
 * Les membres d'une organisation, avec leur nom lisible.
 *
 * La table des membres ne porte que des identifiants : afficher une liste
 * d'identifiants à un responsable ne lui apprend rien sur qui est dans son
 * organisation.
 */
export async function chargerMembres(organisationId: string): Promise<OrganisationMembre[]> {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("user_id,role,joined_at")
    .eq("organisation_id", organisationId)
    .order("joined_at");

  if (error || !data) return [];

  const identifiants = data.map((m) => m.user_id);
  const { data: profils } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", identifiants);

  const noms = new Map((profils ?? []).map((p) => [p.id, p.display_name]));

  return data.map((m) => ({
    user_id: m.user_id,
    role: m.role as OrgRole,
    joined_at: m.joined_at,
    // Un compte supprimé laisse sa ligne d'appartenance : le dire vaut mieux
    // qu'afficher un identifiant nu.
    nom: noms.get(m.user_id) ?? "Compte supprimé",
  }));
}

export default useOrganisations;
