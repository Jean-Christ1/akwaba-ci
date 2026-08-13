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
      errand_events: {
        Row: {
          actor_id: string | null
          created_at: string
          errand_id: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["errand_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          errand_id: string
          id?: string
          note?: string | null
          status: Database["public"]["Enums"]["errand_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          errand_id?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["errand_status"]
        }
        Relationships: [
          {
            foreignKeyName: "errand_events_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_messages: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string
          errand_id: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          body: string
          created_at?: string
          errand_id: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          errand_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "errand_messages_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_offers: {
        Row: {
          created_at: string
          errand_id: string
          eta_minutes: number
          id: string
          message: string | null
          price: number
          runner_id: string
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          created_at?: string
          errand_id: string
          eta_minutes?: number
          id?: string
          message?: string | null
          price?: number
          runner_id: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          created_at?: string
          errand_id?: string
          eta_minutes?: number
          id?: string
          message?: string | null
          price?: number
          runner_id?: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "errand_offers_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          errand_id: string
          id: string
          kind: Database["public"]["Enums"]["errand_payment_kind"]
          method: Database["public"]["Enums"]["pay_method"]
          payer_id: string
          proof_url: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          errand_id: string
          id?: string
          kind: Database["public"]["Enums"]["errand_payment_kind"]
          method?: Database["public"]["Enums"]["pay_method"]
          payer_id: string
          proof_url?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          errand_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["errand_payment_kind"]
          method?: Database["public"]["Enums"]["pay_method"]
          payer_id?: string
          proof_url?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
        ]
      }
      errands: {
        Row: {
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_estimate: number
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          created_at: string
          customer_id: string
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_code: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["pay_method"]
          payment_status: Database["public"]["Enums"]["pay_status"]
          preferred_contact: string
          rating: number | null
          receipt_url: string | null
          review: string | null
          runner_id: string | null
          runner_payout: number
          scheduled_for: string | null
          service_fee: number
          started_at: string | null
          status: Database["public"]["Enums"]["errand_status"]
          third_party_contact: string | null
          tip_amount: number
          title: string
          total_amount: number
          updated_at: string
          urgency: string
          vehicle_required: string
          volume_size: string
          zone: string | null
        }
        Insert: {
          actual_minutes?: number | null
          advance_amount?: number
          advance_confirmed_at?: string | null
          advance_proof_url?: string | null
          balance_due?: number
          budget_estimate?: number
          category?: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          customer_id: string
          delivery_address: string
          delivery_fee?: number
          distance_km?: number
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes?: number
          fund_mode?: Database["public"]["Enums"]["fund_mode"]
          handover_code?: string | null
          id?: string
          items?: Json
          items_total?: number
          lat?: number | null
          lng?: number | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pay_method"]
          payment_status?: Database["public"]["Enums"]["pay_status"]
          preferred_contact?: string
          rating?: number | null
          receipt_url?: string | null
          review?: string | null
          runner_id?: string | null
          runner_payout?: number
          scheduled_for?: string | null
          service_fee?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["errand_status"]
          third_party_contact?: string | null
          tip_amount?: number
          title: string
          total_amount?: number
          updated_at?: string
          urgency?: string
          vehicle_required?: string
          volume_size?: string
          zone?: string | null
        }
        Update: {
          actual_minutes?: number | null
          advance_amount?: number
          advance_confirmed_at?: string | null
          advance_proof_url?: string | null
          balance_due?: number
          budget_estimate?: number
          category?: Database["public"]["Enums"]["errand_category"]
          city?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          customer_id?: string
          delivery_address?: string
          delivery_fee?: number
          distance_km?: number
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes?: number
          fund_mode?: Database["public"]["Enums"]["fund_mode"]
          handover_code?: string | null
          id?: string
          items?: Json
          items_total?: number
          lat?: number | null
          lng?: number | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pay_method"]
          payment_status?: Database["public"]["Enums"]["pay_status"]
          preferred_contact?: string
          rating?: number | null
          receipt_url?: string | null
          review?: string | null
          runner_id?: string | null
          runner_payout?: number
          scheduled_for?: string | null
          service_fee?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["errand_status"]
          third_party_contact?: string | null
          tip_amount?: number
          title?: string
          total_amount?: number
          updated_at?: string
          urgency?: string
          vehicle_required?: string
          volume_size?: string
          zone?: string | null
        }
        Relationships: []
      }
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
      payout_requests: {
        Row: {
          account_id: string | null
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          status: Database["public"]["Enums"]["payout_status"]
          transfer_reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          admin_note?: string | null
          amount: number
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          transfer_reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          transfer_reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "runner_payout_accounts"
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
      user_favorites: {
        Row: {
          created_at: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
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
          hours: Json
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
          hours?: Json
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
          hours?: Json
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
      referrals: {
        Row: {
          code: string
          created_at: string
          credits: number
          id: string
          invited_count: number
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          credits?: number
          id?: string
          invited_count?: number
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          id?: string
          invited_count?: number
          user_id?: string
        }
        Relationships: []
      }
      runner_payout_accounts: {
        Row: {
          account_name: string
          account_number: string
          created_at: string
          id: string
          is_default: boolean
          provider: Database["public"]["Enums"]["momo_provider"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          created_at?: string
          id?: string
          is_default?: boolean
          provider?: Database["public"]["Enums"]["momo_provider"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          created_at?: string
          id?: string
          is_default?: boolean
          provider?: Database["public"]["Enums"]["momo_provider"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      runner_profiles: {
        Row: {
          bio: string | null
          city: string
          created_at: string
          full_name: string
          id: string
          id_doc_url: string | null
          is_online: boolean
          jobs_completed: number
          phone: string
          photo_url: string | null
          rating: number
          status: Database["public"]["Enums"]["runner_status"]
          updated_at: string
          user_id: string
          vehicle: string
          whatsapp: string | null
          zones: Json
        }
        Insert: {
          bio?: string | null
          city: string
          created_at?: string
          full_name: string
          id?: string
          id_doc_url?: string | null
          is_online?: boolean
          jobs_completed?: number
          phone: string
          photo_url?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["runner_status"]
          updated_at?: string
          user_id: string
          vehicle?: string
          whatsapp?: string | null
          zones?: Json
        }
        Update: {
          bio?: string | null
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          id_doc_url?: string | null
          is_online?: boolean
          jobs_completed?: number
          phone?: string
          photo_url?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["runner_status"]
          updated_at?: string
          user_id?: string
          vehicle?: string
          whatsapp?: string | null
          zones?: Json
        }
        Relationships: []
      }
      runner_wallets: {
        Row: {
          available_balance: number
          created_at: string
          id: string
          lifetime_earnings: number
          pending_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          id?: string
          lifetime_earnings?: number
          pending_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          id?: string
          lifetime_earnings?: number
          pending_balance?: number
          updated_at?: string
          user_id?: string
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
      wallet_entries: {
        Row: {
          amount: number
          created_at: string
          errand_id: string | null
          id: string
          kind: Database["public"]["Enums"]["wallet_entry_kind"]
          label: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          errand_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["wallet_entry_kind"]
          label: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          errand_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["wallet_entry_kind"]
          label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_entries_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      open_errands_feed: {
        Row: {
          budget_estimate: number | null
          category: Database["public"]["Enums"]["errand_category"] | null
          city: string | null
          created_at: string | null
          distance_km: number | null
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes: number | null
          fund_mode: Database["public"]["Enums"]["fund_mode"] | null
          id: string | null
          items: Json | null
          runner_payout: number | null
          scheduled_for: string | null
          service_fee: number | null
          title: string | null
          urgency: string | null
          vehicle_required: string | null
          volume_size: string | null
          zone: string | null
        }
        Relationships: []
      }
      runner_public_profiles: {
        Row: {
          bio: string | null
          city: string | null
          full_name: string | null
          is_online: boolean | null
          jobs_completed: number | null
          photo_url: string | null
          rating: number | null
          user_id: string | null
          vehicle: string | null
          zones: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_runner: { Args: { _uid: string }; Returns: boolean }
      is_errand_participant: {
        Args: { _errand: string; _uid: string }
        Returns: boolean
      }
      errand_accept_offer: {
        Args: { p_offer_id: string }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_advance_status: {
        Args: {
          p_errand_id: string
          p_next: Database["public"]["Enums"]["errand_status"]
          p_handover_code?: string | null
        }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_save_invoice: {
        Args: {
          p_errand_id: string
          p_items_total: number
          p_delivery_fee?: number
          p_tip_amount?: number
          p_receipt_url?: string | null
        }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_confirm_payment: {
        Args: { p_errand_id: string }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_cancel: {
        Args: { p_errand_id: string; p_reason?: string | null }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_open_dispute: {
        Args: { p_errand_id: string; p_reason: string }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_rate_runner: {
        Args: {
          p_errand_id: string
          p_rating: number
          p_review?: string | null
        }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_handover_code: {
        Args: { p_errand_id: string }
        Returns: string | null
      }
      errand_attach_proof: {
        Args: {
          p_errand_id: string
          p_kind: string
          p_path: string
          p_amount?: number | null
        }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      payout_request_create: {
        Args: { p_amount: number; p_account_id?: string | null }
        Returns: Database["public"]["Tables"]["payout_requests"]["Row"]
      }
      payout_request_settle: {
        Args: {
          p_request_id: string
          p_status: Database["public"]["Enums"]["payout_status"]
          p_reference?: string | null
          p_note?: string | null
        }
        Returns: Database["public"]["Tables"]["payout_requests"]["Row"]
      }
      wallet_release_matured_earnings: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "partner" | "user"
      dropoff_mode: "runner_delivers" | "third_party" | "customer_pickup"
      errand_category:
        | "grocery"
        | "market"
        | "pharmacy"
        | "restaurant"
        | "artisan"
        | "admin_paperwork"
        | "gas"
        | "electronics"
        | "other"
      errand_payment_kind:
        | "shopping_advance"
        | "service_fee"
        | "top_up"
        | "refund"
        | "tip"
      errand_status:
        | "draft"
        | "open"
        | "assigned"
        | "shopping"
        | "delivering"
        | "delivered"
        | "completed"
        | "cancelled"
        | "disputed"
      fund_mode: "customer_advance" | "runner_advance" | "on_delivery"
      lead_kind: "lodging" | "restaurant" | "generic"
      lead_status: "new" | "in_review" | "contacted" | "closed"
      moderation_action: "approved" | "rejected" | "pending" | "note"
      momo_provider:
        | "wave"
        | "orange_money"
        | "mtn_momo"
        | "moov_money"
        | "bank"
      offer_status: "pending" | "accepted" | "rejected" | "withdrawn"
      pay_method:
        | "cash"
        | "wave"
        | "orange_money"
        | "mtn_momo"
        | "moov_money"
        | "card"
      pay_status: "pending" | "held" | "paid" | "refunded" | "failed"
      payout_status: "requested" | "processing" | "paid" | "rejected"
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
      runner_status: "pending" | "approved" | "suspended" | "rejected"
      wallet_entry_kind:
        | "earning"
        | "commission"
        | "advance_refund"
        | "payout"
        | "adjustment"
        | "bonus"
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
      dropoff_mode: ["runner_delivers", "third_party", "customer_pickup"],
      errand_category: [
        "grocery",
        "market",
        "pharmacy",
        "restaurant",
        "artisan",
        "admin_paperwork",
        "gas",
        "electronics",
        "other",
      ],
      errand_payment_kind: [
        "shopping_advance",
        "service_fee",
        "top_up",
        "refund",
        "tip",
      ],
      errand_status: [
        "draft",
        "open",
        "assigned",
        "shopping",
        "delivering",
        "delivered",
        "completed",
        "cancelled",
        "disputed",
      ],
      fund_mode: ["customer_advance", "runner_advance", "on_delivery"],
      lead_kind: ["lodging", "restaurant", "generic"],
      lead_status: ["new", "in_review", "contacted", "closed"],
      moderation_action: ["approved", "rejected", "pending", "note"],
      momo_provider: ["wave", "orange_money", "mtn_momo", "moov_money", "bank"],
      offer_status: ["pending", "accepted", "rejected", "withdrawn"],
      pay_method: [
        "cash",
        "wave",
        "orange_money",
        "mtn_momo",
        "moov_money",
        "card",
      ],
      pay_status: ["pending", "held", "paid", "refunded", "failed"],
      payout_status: ["requested", "processing", "paid", "rejected"],
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
      runner_status: ["pending", "approved", "suspended", "rejected"],
      wallet_entry_kind: [
        "earning",
        "commission",
        "advance_refund",
        "payout",
        "adjustment",
        "bonus",
      ],
    },
  },
} as const
