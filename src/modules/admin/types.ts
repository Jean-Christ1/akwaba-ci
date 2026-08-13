import type { Database } from "@/integrations/supabase/types";

export type PlaceRow = Database["public"]["Tables"]["places"]["Row"];

export type LeadRow = Database["public"]["Tables"]["leads"]["Row"] & {
  /** Jointure select("*, places(name)"). */
  places?: { name: string } | null;
};

export type ModerationEventRow = Database["public"]["Tables"]["place_moderation_events"]["Row"];

export type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"] & {
  /** Rapprochement côté client : user_roles et profiles n'ont pas de relation directe. */
  profiles?: { display_name: string | null } | null;
};

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export type AppRole = Database["public"]["Enums"]["app_role"];
