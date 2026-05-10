export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      leads: {
        Row: {
          budget: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          email: string
          full_name: string
          id: string
          kind: Database["public"]["Enums"]["lead_kind"]
          message: string
          partner_note: string | null
          party_size: number | null
          phone: string | null
          place_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          email: string
          full_name: string
          id?: string
          kind?: Database["public"]["Enums"]["lead_kind"]
          message: string
          partner_note?: string | null
          party_size?: number | null
          phone?: string | null
          place_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          email?: string
          full_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["lead_kind"]
          message?: string
          partner_note?: string | null
          party_size?: number | null
          phone?: string | null
          place_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_moderation_events: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"]
          created_at: string
          id: string
          moderator_id: string
          note: string | null
          place_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"]
          created_at?: string
          id?: string
          moderator_id: string
          note?: string | null
          place_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"]
          created_at?: string
          id?: string
          moderator_id?: string
          note?: string | null
          place_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          address: string
          average_duration: string | null
          best_for: Json
          best_time: string | null
          city: string
          created_at: string
          cuisines: Json
          curator_note: string | null
          description: string
          email: string | null
          gallery: Json
          id: string
          image: string | null
          lat: number
          lng: number
          name: string
          owner_id: string | null
          phone: string | null
          practical_tips: Json
          premium: boolean
          price_band: string
          services: Json
          slug: string
          standing: number
          status: Database["public"]["Enums"]["place_status"]
          story: string | null
          tagline: string | null
          tags: Json
          type: Database["public"]["Enums"]["place_type"]
          updated_at: string
          website: string | null
          whatsapp: string | null
          why_visit: Json
          zone: string | null
        }
        Insert: {
          address: string
          average_duration?: string | null
          best_for?: Json
          best_time?: string | null
          city: string
          created_at?: string
          cuisines?: Json
          curator_note?: string | null
          description: string
          email?: string | null
          gallery?: Json
          id?: string
          image?: string | null
          lat: number
          lng: number
          name: string
          owner_id?: string | null
          phone?: string | null
          practical_tips?: Json
          premium?: boolean
          price_band?: string
          services?: Json
          slug: string
          standing?: number
          status?: Database["public"]["Enums"]["place_status"]
          story?: string | null
          tagline?: string | null
          tags?: Json
          type: Database["public"]["Enums"]["place_type"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          why_visit?: Json
          zone?: string | null
        }
        Update: {
          address?: string
          average_duration?: string | null
          best_for?: Json
          best_time?: string | null
          city?: string
          created_at?: string
          cuisines?: Json
          curator_note?: string | null
          description?: string
          email?: string | null
          gallery?: Json
          id?: string
          image?: string | null
          lat?: number
          lng?: number
          name?: string
          owner_id?: string | null
          phone?: string | null
          practical_tips?: Json
          premium?: boolean
          price_band?: string
          services?: Json
          slug?: string
          standing?: number
          status?: Database["public"]["Enums"]["place_status"]
          story?: string | null
          tagline?: string | null
          tags?: Json
          type?: Database["public"]["Enums"]["place_type"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          why_visit?: Json
          zone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "partner" | "user"
      lead_kind: "lodging" | "restaurant" | "generic"
      lead_status: "new" | "in_review" | "contacted" | "closed"
      moderation_action: "approved" | "rejected" | "pending" | "note"
      place_status: "draft" | "pending" | "published" | "rejected"
      place_type:
        | "lodging"
        | "restaurant"
        | "maquis"
        | "attraction"
        | "beach"
        | "nightlife"
        | "culture"
        | "shopping"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "partner", "user"],
      lead_kind: ["lodging", "restaurant", "generic"],
      lead_status: ["new", "in_review", "contacted", "closed"],
      moderation_action: ["approved", "rejected", "pending", "note"],
      place_status: ["draft", "pending", "published", "rejected"],
      place_type: [
        "lodging",
        "restaurant",
        "maquis",
        "attraction",
        "beach",
        "nightlife",
        "culture",
        "shopping",
      ],
    },
  },
} as const
