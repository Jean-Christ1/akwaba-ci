import { supabase } from "@/integrations/supabase/client";

/**
 * Favoris rattachés au compte.
 *
 * L'adaptateur local reste la source hors connexion et pour les visiteurs non
 * authentifiés. Dès qu'un compte est disponible, les favoris sont synchronisés
 * afin de suivre l'utilisateur d'un appareil à l'autre.
 */

export async function listRemoteFavorites(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_favorites")
    .select("place_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => row.place_id);
}

export async function addRemoteFavorite(userId: string, placeId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favorites")
    .upsert({ user_id: userId, place_id: placeId }, { onConflict: "user_id,place_id" });

  if (error) throw error;
}

export async function removeRemoteFavorite(userId: string, placeId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("place_id", placeId);

  if (error) throw error;
}

/**
 * Reprise des favoris posés avant la connexion.
 *
 * On additionne les deux ensembles plutôt que d'en écraser un : un utilisateur
 * qui a marqué des adresses avant de créer son compte ne doit rien perdre.
 */
export async function mergeLocalFavorites(
  userId: string,
  localIds: string[]
): Promise<string[]> {
  const remote = await listRemoteFavorites(userId);
  const missing = localIds.filter((id) => !remote.includes(id));

  if (missing.length) {
    const { error } = await supabase
      .from("user_favorites")
      .upsert(
        missing.map((placeId) => ({ user_id: userId, place_id: placeId })),
        { onConflict: "user_id,place_id" }
      );
    if (error) throw error;
  }

  return Array.from(new Set([...remote, ...localIds]));
}
