import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { favoritesAdapter } from "../infrastructure/favorites-local";
import {
  addRemoteFavorite,
  mergeLocalFavorites,
  removeRemoteFavorite,
} from "../infrastructure/favorites-supabase";

/**
 * Favoris de l'utilisateur.
 *
 * Hors connexion, ils vivent dans le stockage local, ce qui permet à un
 * visiteur de constituer son carnet d'adresses sans créer de compte. Dès qu'une
 * session existe, ils sont repris puis synchronisés côté serveur, afin de
 * suivre l'utilisateur d'un appareil à l'autre comme le promet l'écran de
 * connexion.
 */
export function useFavorites() {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>(() => favoritesAdapter.list());

  useEffect(() => {
    const unsub = favoritesAdapter.subscribe(() => setIds(favoritesAdapter.list()));
    return unsub;
  }, []);

  // À la connexion, on additionne les favoris locaux et distants : rien de ce
  // qui a été marqué avant la création du compte n'est perdu.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    mergeLocalFavorites(user.id, favoritesAdapter.list())
      .then((merged) => {
        if (cancelled) return;
        favoritesAdapter.replace(merged);
        setIds(merged);
      })
      .catch(() => {
        // Le stockage local reste utilisable : l'utilisateur garde ses favoris
        // sur cet appareil même si la synchronisation échoue.
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = useCallback(
    (id: string) => {
      const wasFavorite = favoritesAdapter.list().includes(id);
      favoritesAdapter.toggle(id);

      if (!user) return;
      const action = wasFavorite
        ? removeRemoteFavorite(user.id, id)
        : addRemoteFavorite(user.id, id);

      action.catch(() => {
        // Le basculement local est conservé. La prochaine connexion
        // resynchronisera l'ensemble.
      });
    },
    [user]
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, has };
}
