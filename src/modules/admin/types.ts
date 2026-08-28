import type { Database } from "@/integrations/supabase/types";

export type PlaceRow = Database["public"]["Tables"]["places"]["Row"];

/**
 * Une demande telle que le navigateur la recoit.
 *
 * Deux colonnes de la table en sont absentes, et il faut que le type le dise.
 * partner_note n'est plus accordee en lecture : elle est interne a
 * l'etablissement, et une politique de ligne ne sait pas cacher une colonne
 * alors que le visiteur lit la meme ligne. Elle revient par lead_note_interne.
 * replied_by ne sert a personne cote ecran.
 */
export type LeadRow = Omit<
  Database["public"]["Tables"]["leads"]["Row"],
  "partner_note" | "replied_by"
> & {
  /** Jointure select("..., places(name)"). */
  places?: { name: string; slug?: string } | null;
};

export type ModerationEventRow = Database["public"]["Tables"]["place_moderation_events"]["Row"];

export type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"] & {
  /** Rapprochement côté client : user_roles et profiles n'ont pas de relation directe. */
  profiles?: { display_name: string | null } | null;
};

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export type AppRole = Database["public"]["Enums"]["app_role"];
