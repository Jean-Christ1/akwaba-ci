import { useEffect, useState, useCallback } from "react";
import { favoritesAdapter } from "../infrastructure/favorites-local";

export function useFavorites() {
  const [ids, setIds] = useState<string[]>(() => favoritesAdapter.list());

  useEffect(() => {
    const unsub = favoritesAdapter.subscribe(() => setIds(favoritesAdapter.list()));
    return unsub;
  }, []);

  const toggle = useCallback((id: string) => favoritesAdapter.toggle(id), []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, has };
}
