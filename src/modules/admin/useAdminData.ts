import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { LeadRow, PlaceRow, UserRoleRow } from "./types";

interface Options {
  /** Aucune requête tant que la session n'est pas établie. */
  enabled: boolean;
  isAdmin: boolean;
  isModerator: boolean;
}

export interface AdminData {
  places: PlaceRow[];
  leads: LeadRow[];
  pending: PlaceRow[];
  users: UserRoleRow[];
  loadBusy: boolean;
  lastLoadedAt: Date | null;
  load: () => Promise<void>;
}

/**
 * Chargement des données du back-office.
 *
 * Les quatre jeux de lignes sont lus ensemble parce qu'ils partagent le même
 * déclencheur : l'ouverture de l'écran, une action de modération, un événement
 * temps réel. Les séparer multiplierait les rafraîchissements partiels et
 * laisserait des onglets afficher un état périmé.
 */
export function useAdminData({ enabled, isAdmin, isModerator }: Options): AdminData {
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [pending, setPending] = useState<PlaceRow[]>([]);
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loadBusy, setLoadBusy] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoadBusy(true);
    try {
      const { data: p } = await supabase
        .from("places")
        .select("*")
        .order("created_at", { ascending: false });
      setPlaces(p ?? []);

      // Colonnes nommees plutot qu'une etoile : partner_note n'est plus
      // accordee en lecture, et une etoile demanderait une colonne refusee.
      const { data: l } = await supabase
        .from("leads")
        .select("id,user_id,place_id,kind,full_name,email,phone,party_size,date_from,date_to,budget,message,status,partner_reply,replied_at,created_at,updated_at, places(name)")
        .order("created_at", { ascending: false });
      setLeads(l ?? []);

      if (isModerator) {
        const { data: pend } = await supabase
          .from("places")
          .select("*")
          .in("status", ["pending", "rejected"])
          .order("created_at", { ascending: false });
        setPending(pend ?? []);
      }

      if (isAdmin) {
        // user_roles et profiles pointent tous deux vers auth.users mais n'ont
        // aucune relation directe : PostgREST ne sait pas les joindre. On charge
        // donc les deux et on rapproche les noms côté client.
        const { data: ur } = await supabase
          .from("user_roles")
          .select("*")
          .order("created_at", { ascending: false });
        const roleRows = (ur ?? []) as UserRoleRow[];
        const uids = Array.from(new Set(roleRows.map((u) => u.user_id)));
        const nameByUser = new Map<string, string | null>();
        if (uids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,display_name")
            .in("id", uids);
          (profs ?? []).forEach((pr) => nameByUser.set(pr.id, pr.display_name));
        }
        setUsers(
          roleRows.map((u) => ({
            ...u,
            profiles: { display_name: nameByUser.get(u.user_id) ?? null },
          }))
        );
      }

      setLastLoadedAt(new Date());
    } finally {
      setLoadBusy(false);
    }
  }, [isAdmin, isModerator]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { places, leads, pending, users, loadBusy, lastLoadedAt, load };
}
