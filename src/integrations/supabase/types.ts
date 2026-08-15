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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          base: string
          budget_tolerance_min: number
          budget_tolerance_pct: number
          created_at: string
          delivery_fee_cap: number
          distance_grace_km: number
          distance_per_km: number
          effective_from: string
          hold_hours: number
          id: string
          is_active: boolean
          min_payout: number
          min_service_fee: number
          overrun_cap_ratio: number
          overtime_grace_minutes: number
          overtime_per_minute: number
          rate: number
          settlement: Database["public"]["Enums"]["settlement_mode"]
          tip_cap: number
          version: number
        }
        Insert: {
          base?: string
          budget_tolerance_min?: number
          budget_tolerance_pct?: number
          created_at?: string
          delivery_fee_cap?: number
          distance_grace_km?: number
          distance_per_km?: number
          effective_from?: string
          hold_hours?: number
          id?: string
          is_active?: boolean
          min_payout?: number
          min_service_fee?: number
          overrun_cap_ratio?: number
          overtime_grace_minutes?: number
          overtime_per_minute?: number
          rate: number
          settlement?: Database["public"]["Enums"]["settlement_mode"]
          tip_cap?: number
          version: number
        }
        Update: {
          base?: string
          budget_tolerance_min?: number
          budget_tolerance_pct?: number
          created_at?: string
          delivery_fee_cap?: number
          distance_grace_km?: number
          distance_per_km?: number
          effective_from?: string
          hold_hours?: number
          id?: string
          is_active?: boolean
          min_payout?: number
          min_service_fee?: number
          overrun_cap_ratio?: number
          overtime_grace_minutes?: number
          overtime_per_minute?: number
          rate?: number
          settlement?: Database["public"]["Enums"]["settlement_mode"]
          tip_cap?: number
          version?: number
        }
        Relationships: []
      }
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
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_events_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_events_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_events_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_items: {
        Row: {
          created_at: string
          decided_at: string | null
          errand_id: string
          id: string
          label: string
          position: number
          proposed_at: string | null
          qty: string | null
          state: Database["public"]["Enums"]["errand_item_state"]
          substitute_label: string | null
          substitute_note: string | null
          substitute_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          errand_id: string
          id?: string
          label: string
          position?: number
          proposed_at?: string | null
          qty?: string | null
          state?: Database["public"]["Enums"]["errand_item_state"]
          substitute_label?: string | null
          substitute_note?: string | null
          substitute_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          errand_id?: string
          id?: string
          label?: string
          position?: number
          proposed_at?: string | null
          qty?: string | null
          state?: Database["public"]["Enums"]["errand_item_state"]
          substitute_label?: string | null
          substitute_note?: string | null
          substitute_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "errand_items_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_items_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_items_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_items_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
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
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_messages_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_messages_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_messages_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
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
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_offers_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_offers_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_offers_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
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
          payer_id: string | null
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
          payer_id?: string | null
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
          payer_id?: string | null
          proof_url?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_tracking: {
        Row: {
          accuracy_m: number | null
          errand_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
          runner_id: string
        }
        Insert: {
          accuracy_m?: number | null
          errand_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          runner_id: string
        }
        Update: {
          accuracy_m?: number | null
          errand_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          runner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "errand_tracking_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_tracking_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_tracking_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_tracking_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      errands: {
        Row: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
          accepted_at?: string | null
          actual_distance_km?: number | null
          actual_minutes?: number | null
          advance_amount?: number
          advance_confirmed_at?: string | null
          advance_declared_amount?: number
          advance_declared_at?: string | null
          advance_proof_url?: string | null
          balance_due?: number
          budget_approved_amount?: number | null
          budget_approved_at?: string | null
          budget_estimate?: number
          budget_overrun_pending?: boolean
          category?: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount?: number
          commission_rate?: number
          commission_rule_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_address: string
          delivery_fee?: number
          distance_km?: number
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes?: number
          extra_distance_km?: number
          fund_mode?: Database["public"]["Enums"]["fund_mode"]
          handover_attempts?: number
          handover_code?: string | null
          handover_locked_at?: string | null
          handover_verified_at?: string | null
          id?: string
          items?: Json
          items_total?: number
          lat?: number | null
          lng?: number | null
          notes?: string | null
          overrun_approved_at?: string | null
          overrun_fee?: number
          overtime_minutes?: number
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
          shopping_at?: string | null
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
          accepted_at?: string | null
          actual_distance_km?: number | null
          actual_minutes?: number | null
          advance_amount?: number
          advance_confirmed_at?: string | null
          advance_declared_amount?: number
          advance_declared_at?: string | null
          advance_proof_url?: string | null
          balance_due?: number
          budget_approved_amount?: number | null
          budget_approved_at?: string | null
          budget_estimate?: number
          budget_overrun_pending?: boolean
          category?: Database["public"]["Enums"]["errand_category"]
          city?: string
          commission_amount?: number
          commission_rate?: number
          commission_rule_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_address?: string
          delivery_fee?: number
          distance_km?: number
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes?: number
          extra_distance_km?: number
          fund_mode?: Database["public"]["Enums"]["fund_mode"]
          handover_attempts?: number
          handover_code?: string | null
          handover_locked_at?: string | null
          handover_verified_at?: string | null
          id?: string
          items?: Json
          items_total?: number
          lat?: number | null
          lng?: number | null
          notes?: string | null
          overrun_approved_at?: string | null
          overrun_fee?: number
          overtime_minutes?: number
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
          shopping_at?: string | null
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
        Relationships: [
          {
            foreignKeyName: "errands_commission_rule_id_fkey"
            columns: ["commission_rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
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
      notification_outbox: {
        Row: {
          attempts: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          errand_id: string | null
          event: string
          id: string
          last_error: string | null
          sent_at: string | null
          state: Database["public"]["Enums"]["notification_state"]
          subject: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          errand_id?: string | null
          event: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["notification_state"]
          subject: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          errand_id?: string | null
          event?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["notification_state"]
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          code: string
          configured_at: string | null
          fee_fixed: number
          fee_percent: number
          instructions: string | null
          is_enabled: boolean
          kind: Database["public"]["Enums"]["momo_provider"] | null
          label: string
          merchant_name: string | null
          merchant_number: string | null
          position: number
          secret_name: string | null
          updated_at: string
        }
        Insert: {
          code: string
          configured_at?: string | null
          fee_fixed?: number
          fee_percent?: number
          instructions?: string | null
          is_enabled?: boolean
          kind?: Database["public"]["Enums"]["momo_provider"] | null
          label: string
          merchant_name?: string | null
          merchant_number?: string | null
          position?: number
          secret_name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          configured_at?: string | null
          fee_fixed?: number
          fee_percent?: number
          instructions?: string | null
          is_enabled?: boolean
          kind?: Database["public"]["Enums"]["momo_provider"] | null
          label?: string
          merchant_name?: string | null
          merchant_number?: string | null
          position?: number
          secret_name?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "place_moderation_events_place_id_fkey"
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
          commission_due: number
          commission_settled: number
          created_at: string
          id: string
          lifetime_earnings: number
          pending_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          commission_due?: number
          commission_settled?: number
          created_at?: string
          id?: string
          lifetime_earnings?: number
          pending_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          commission_due?: number
          commission_settled?: number
          created_at?: string
          id?: string
          lifetime_earnings?: number
          pending_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_cities: {
        Row: {
          created_at: string
          errands_enabled: boolean
          is_active: boolean
          lat: number
          lng: number
          name: string
          position: number
          region: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          errands_enabled?: boolean
          is_active?: boolean
          lat: number
          lng: number
          name: string
          position?: number
          region?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          errands_enabled?: boolean
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          position?: number
          region?: string | null
          slug?: string
        }
        Relationships: []
      }
      service_zones: {
        Row: {
          city_slug: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_name: string | null
          position: number
        }
        Insert: {
          city_slug: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_name?: string | null
          position?: number
        }
        Update: {
          city_slug?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_name?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_zones_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "service_cities"
            referencedColumns: ["slug"]
          },
        ]
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
          matures_at: string | null
          released_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          errand_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["wallet_entry_kind"]
          label: string
          matures_at?: string | null
          released_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          errand_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["wallet_entry_kind"]
          label?: string
          matures_at?: string | null
          released_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_entries_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      commission_receivables: {
        Row: {
          commission_due: number | null
          commission_settled: number | null
          derniere_commission: string | null
          full_name: string | null
          jobs_completed: number | null
          lifetime_earnings: number | null
          phone: string | null
          runner_id: string | null
        }
        Relationships: []
      }
      errand_market_detail: {
        Row: {
          budget_estimate: number | null
          category: Database["public"]["Enums"]["errand_category"] | null
          city: string | null
          commission_amount: number | null
          created_at: string | null
          distance_km: number | null
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes: number | null
          fund_mode: Database["public"]["Enums"]["fund_mode"] | null
          id: string | null
          items: Json | null
          payment_method: Database["public"]["Enums"]["pay_method"] | null
          runner_payout: number | null
          scheduled_for: string | null
          service_fee: number | null
          status: Database["public"]["Enums"]["errand_status"] | null
          title: string | null
          urgency: string | null
          vehicle_required: string | null
          volume_size: string | null
          zone: string | null
        }
        Insert: {
          budget_estimate?: number | null
          category?: Database["public"]["Enums"]["errand_category"] | null
          city?: string | null
          commission_amount?: number | null
          created_at?: string | null
          distance_km?: number | null
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes?: number | null
          fund_mode?: Database["public"]["Enums"]["fund_mode"] | null
          id?: string | null
          items?: Json | null
          payment_method?: Database["public"]["Enums"]["pay_method"] | null
          runner_payout?: number | null
          scheduled_for?: string | null
          service_fee?: number | null
          status?: Database["public"]["Enums"]["errand_status"] | null
          title?: string | null
          urgency?: string | null
          vehicle_required?: string | null
          volume_size?: string | null
          zone?: string | null
        }
        Update: {
          budget_estimate?: number | null
          category?: Database["public"]["Enums"]["errand_category"] | null
          city?: string | null
          commission_amount?: number | null
          created_at?: string | null
          distance_km?: number | null
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes?: number | null
          fund_mode?: Database["public"]["Enums"]["fund_mode"] | null
          id?: string | null
          items?: Json | null
          payment_method?: Database["public"]["Enums"]["pay_method"] | null
          runner_payout?: number | null
          scheduled_for?: string | null
          service_fee?: number | null
          status?: Database["public"]["Enums"]["errand_status"] | null
          title?: string | null
          urgency?: string | null
          vehicle_required?: string | null
          volume_size?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      errand_payment_history: {
        Row: {
          amount: number | null
          confirmed_at: string | null
          created_at: string | null
          errand_id: string | null
          id: string | null
          kind: Database["public"]["Enums"]["errand_payment_kind"] | null
          method: Database["public"]["Enums"]["pay_method"] | null
          reference: string | null
        }
        Insert: {
          amount?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          errand_id?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["errand_payment_kind"] | null
          method?: Database["public"]["Enums"]["pay_method"] | null
          reference?: string | null
        }
        Update: {
          amount?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          errand_id?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["errand_payment_kind"] | null
          method?: Database["public"]["Enums"]["pay_method"] | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_payments_errand_id_fkey"
            columns: ["errand_id"]
            isOneToOne: false
            referencedRelation: "open_errands_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      errand_performance: {
        Row: {
          actual_distance_km: number | null
          actual_minutes: number | null
          city: string | null
          commission_amount: number | null
          created_at: string | null
          customer_id: string | null
          distance_variance_pct: number | null
          estimated_distance_km: number | null
          estimated_minutes: number | null
          extra_distance_km: number | null
          id: string | null
          overrun_fee: number | null
          overtime_minutes: number | null
          runner_id: string | null
          runner_payout: number | null
          service_fee: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["errand_status"] | null
          time_variance_pct: number | null
          title: string | null
          total_amount: number | null
          zone: string | null
        }
        Insert: {
          actual_distance_km?: number | null
          actual_minutes?: number | null
          city?: string | null
          commission_amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          distance_variance_pct?: never
          estimated_distance_km?: number | null
          estimated_minutes?: number | null
          extra_distance_km?: number | null
          id?: string | null
          overrun_fee?: number | null
          overtime_minutes?: number | null
          runner_id?: string | null
          runner_payout?: number | null
          service_fee?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["errand_status"] | null
          time_variance_pct?: never
          title?: string | null
          total_amount?: number | null
          zone?: string | null
        }
        Update: {
          actual_distance_km?: number | null
          actual_minutes?: number | null
          city?: string | null
          commission_amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          distance_variance_pct?: never
          estimated_distance_km?: number | null
          estimated_minutes?: number | null
          extra_distance_km?: number | null
          id?: string | null
          overrun_fee?: number | null
          overtime_minutes?: number | null
          runner_id?: string | null
          runner_payout?: number | null
          service_fee?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["errand_status"] | null
          time_variance_pct?: never
          title?: string | null
          total_amount?: number | null
          zone?: string | null
        }
        Relationships: []
      }
      notification_health: {
        Row: {
          abandonnees: number | null
          etat: string | null
          nombre: number | null
          plus_ancienne: string | null
          plus_recente: string | null
        }
        Relationships: []
      }
      open_errands_feed: {
        Row: {
          budget_estimate: number | null
          category: Database["public"]["Enums"]["errand_category"] | null
          city: string | null
          created_at: string | null
          delivery_fee: number | null
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
          total_amount: number | null
          urgency: string | null
          vehicle_required: string | null
          volume_size: string | null
          zone: string | null
        }
        Insert: {
          budget_estimate?: number | null
          category?: Database["public"]["Enums"]["errand_category"] | null
          city?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          distance_km?: number | null
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes?: number | null
          fund_mode?: Database["public"]["Enums"]["fund_mode"] | null
          id?: string | null
          items?: Json | null
          runner_payout?: number | null
          scheduled_for?: string | null
          service_fee?: number | null
          title?: string | null
          total_amount?: number | null
          urgency?: string | null
          vehicle_required?: string | null
          volume_size?: string | null
          zone?: string | null
        }
        Update: {
          budget_estimate?: number | null
          category?: Database["public"]["Enums"]["errand_category"] | null
          city?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          distance_km?: number | null
          dropoff_mode?: Database["public"]["Enums"]["dropoff_mode"] | null
          estimated_minutes?: number | null
          fund_mode?: Database["public"]["Enums"]["fund_mode"] | null
          id?: string | null
          items?: Json | null
          runner_payout?: number | null
          scheduled_for?: string | null
          service_fee?: number | null
          title?: string | null
          total_amount?: number | null
          urgency?: string | null
          vehicle_required?: string | null
          volume_size?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      payment_methods_public: {
        Row: {
          code: string | null
          instructions: string | null
          kind: Database["public"]["Enums"]["momo_provider"] | null
          label: string | null
          merchant_name: string | null
          merchant_number: string | null
          position: number | null
        }
        Insert: {
          code?: string | null
          instructions?: string | null
          kind?: Database["public"]["Enums"]["momo_provider"] | null
          label?: string | null
          merchant_name?: string | null
          merchant_number?: string | null
          position?: number | null
        }
        Update: {
          code?: string | null
          instructions?: string | null
          kind?: Database["public"]["Enums"]["momo_provider"] | null
          label?: string | null
          merchant_name?: string | null
          merchant_number?: string | null
          position?: number | null
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
        Insert: {
          bio?: string | null
          city?: string | null
          full_name?: string | null
          is_online?: boolean | null
          jobs_completed?: number | null
          photo_url?: string | null
          rating?: number | null
          user_id?: string | null
          vehicle?: string | null
          zones?: Json | null
        }
        Update: {
          bio?: string | null
          city?: string | null
          full_name?: string | null
          is_online?: boolean | null
          jobs_completed?: number | null
          photo_url?: string | null
          rating?: number | null
          user_id?: string | null
          vehicle?: string | null
          zones?: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_dashboard: {
        Args: { p_days?: number }
        Returns: {
          commission_encaissee: number
          courses_cancelled: number
          courses_completed: number
          courses_disputed: number
          courses_open: number
          courses_total: number
          duree_moyenne_min: number
          ecart_distance_moyen: number
          ecart_temps_moyen: number
          montant_a_verser: number
          retraits_en_attente: number
          shoppers_actifs: number
          shoppers_en_attente: number
          supplements: number
          volume_achats: number
          volume_service: number
        }[]
      }
      commission_rule_publish: {
        Args: {
          p_budget_tol_min: number
          p_budget_tol_pct: number
          p_distance_grace_km: number
          p_distance_per_km: number
          p_hold_hours: number
          p_min_payout: number
          p_min_service_fee: number
          p_overrun_cap_ratio: number
          p_overtime_grace: number
          p_overtime_per_min: number
          p_rate: number
        }
        Returns: {
          base: string
          budget_tolerance_min: number
          budget_tolerance_pct: number
          created_at: string
          delivery_fee_cap: number
          distance_grace_km: number
          distance_per_km: number
          effective_from: string
          hold_hours: number
          id: string
          is_active: boolean
          min_payout: number
          min_service_fee: number
          overrun_cap_ratio: number
          overtime_grace_minutes: number
          overtime_per_minute: number
          rate: number
          settlement: Database["public"]["Enums"]["settlement_mode"]
          tip_cap: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_settlement_record: {
        Args: { p_amount: number; p_reference?: string; p_runner_id: string }
        Returns: {
          available_balance: number
          commission_due: number
          commission_settled: number
          created_at: string
          id: string
          lifetime_earnings: number
          pending_balance: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "runner_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_commission_rule: {
        Args: never
        Returns: {
          base: string
          budget_tolerance_min: number
          budget_tolerance_pct: number
          created_at: string
          delivery_fee_cap: number
          distance_grace_km: number
          distance_per_km: number
          effective_from: string
          hold_hours: number
          id: string
          is_active: boolean
          min_payout: number
          min_service_fee: number
          overrun_cap_ratio: number
          overtime_grace_minutes: number
          overtime_per_minute: number
          rate: number
          settlement: Database["public"]["Enums"]["settlement_mode"]
          tip_cap: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      errand_accept_offer: {
        Args: { p_offer_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_add_tip: {
        Args: { p_amount: number; p_errand_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_advance_status: {
        Args: {
          p_errand_id: string
          p_handover_code?: string
          p_next: Database["public"]["Enums"]["errand_status"]
        }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_approve_budget_overrun: {
        Args: { p_errand_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_attach_proof: {
        Args: {
          p_amount?: number
          p_errand_id: string
          p_kind: string
          p_path: string
        }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_cancel: {
        Args: { p_errand_id: string; p_reason?: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_commission_rule: {
        Args: { p_errand_id: string }
        Returns: {
          base: string
          budget_tolerance_min: number
          budget_tolerance_pct: number
          created_at: string
          delivery_fee_cap: number
          distance_grace_km: number
          distance_per_km: number
          effective_from: string
          hold_hours: number
          id: string
          is_active: boolean
          min_payout: number
          min_service_fee: number
          overrun_cap_ratio: number
          overtime_grace_minutes: number
          overtime_per_minute: number
          rate: number
          settlement: Database["public"]["Enums"]["settlement_mode"]
          tip_cap: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_compute_overrun: {
        Args: { p_errand_id: string }
        Returns: {
          capped: boolean
          extra_distance_km: number
          overrun_fee: number
          overtime_minutes: number
        }[]
      }
      errand_confirm_advance: {
        Args: { p_amount?: number; p_errand_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_confirm_payment: {
        Args: { p_errand_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_create: {
        Args: {
          p_budget_estimate: number
          p_category: Database["public"]["Enums"]["errand_category"]
          p_city: string
          p_delivery_address: string
          p_distance_km: number
          p_dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          p_estimated_minutes: number
          p_fund_mode: Database["public"]["Enums"]["fund_mode"]
          p_items: Json
          p_lat?: number
          p_lng?: number
          p_notes: string
          p_payment_method: Database["public"]["Enums"]["pay_method"]
          p_preferred_contact: string
          p_scheduled_for: string
          p_third_party: string
          p_title: string
          p_urgency: string
          p_vehicle_required: string
          p_volume_size: string
          p_zone: string
        }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_declare_advance: {
        Args: { p_amount: number; p_errand_id: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_handover_code: { Args: { p_errand_id: string }; Returns: string }
      errand_item_decide: {
        Args: { p_accept: boolean; p_item_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          errand_id: string
          id: string
          label: string
          position: number
          proposed_at: string | null
          qty: string | null
          state: Database["public"]["Enums"]["errand_item_state"]
          substitute_label: string | null
          substitute_note: string | null
          substitute_price: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "errand_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_item_report: {
        Args: {
          p_item_id: string
          p_label?: string
          p_note?: string
          p_price?: number
          p_state: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          errand_id: string
          id: string
          label: string
          position: number
          proposed_at: string | null
          qty: string | null
          state: Database["public"]["Enums"]["errand_item_state"]
          substitute_label: string | null
          substitute_note: string | null
          substitute_price: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "errand_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_items_seed: { Args: { p_errand_id: string }; Returns: number }
      errand_open_dispute: {
        Args: { p_errand_id: string; p_reason: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_rate_runner: {
        Args: { p_errand_id: string; p_rating: number; p_review?: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_resolve_dispute: {
        Args: { p_errand_id: string; p_issue: string; p_note?: string }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_runner_payout_account: {
        Args: { p_errand_id: string }
        Returns: {
          account_name: string
          account_number: string
          provider: Database["public"]["Enums"]["momo_provider"]
        }[]
      }
      errand_save_invoice: {
        Args: {
          p_delivery_fee?: number
          p_errand_id: string
          p_items_total: number
          p_receipt_url?: string
          p_tip_amount?: number
        }
        Returns: {
          accepted_at: string | null
          actual_distance_km: number | null
          actual_minutes: number | null
          advance_amount: number
          advance_confirmed_at: string | null
          advance_declared_amount: number
          advance_declared_at: string | null
          advance_proof_url: string | null
          balance_due: number
          budget_approved_amount: number | null
          budget_approved_at: string | null
          budget_estimate: number
          budget_overrun_pending: boolean
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          commission_amount: number
          commission_rate: number
          commission_rule_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address: string
          delivery_fee: number
          distance_km: number
          dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
          estimated_minutes: number
          extra_distance_km: number
          fund_mode: Database["public"]["Enums"]["fund_mode"]
          handover_attempts: number
          handover_code: string | null
          handover_locked_at: string | null
          handover_verified_at: string | null
          id: string
          items: Json
          items_total: number
          lat: number | null
          lng: number | null
          notes: string | null
          overrun_approved_at: string | null
          overrun_fee: number
          overtime_minutes: number
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
          shopping_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "errands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_track_position: {
        Args: {
          p_accuracy?: number
          p_errand_id: string
          p_lat: number
          p_lng: number
        }
        Returns: number
      }
      errand_unlock_handover:
        | {
            Args: { p_errand_id: string }
            Returns: {
              accepted_at: string | null
              actual_distance_km: number | null
              actual_minutes: number | null
              advance_amount: number
              advance_confirmed_at: string | null
              advance_declared_amount: number
              advance_declared_at: string | null
              advance_proof_url: string | null
              balance_due: number
              budget_approved_amount: number | null
              budget_approved_at: string | null
              budget_estimate: number
              budget_overrun_pending: boolean
              category: Database["public"]["Enums"]["errand_category"]
              city: string
              commission_amount: number
              commission_rate: number
              commission_rule_id: string | null
              created_at: string
              customer_id: string | null
              delivered_at: string | null
              delivering_at: string | null
              delivery_address: string
              delivery_fee: number
              distance_km: number
              dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
              estimated_minutes: number
              extra_distance_km: number
              fund_mode: Database["public"]["Enums"]["fund_mode"]
              handover_attempts: number
              handover_code: string | null
              handover_locked_at: string | null
              handover_verified_at: string | null
              id: string
              items: Json
              items_total: number
              lat: number | null
              lng: number | null
              notes: string | null
              overrun_approved_at: string | null
              overrun_fee: number
              overtime_minutes: number
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
              shopping_at: string | null
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
            SetofOptions: {
              from: "*"
              to: "errands"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { p_errand_id: string; p_reason?: string }
            Returns: {
              accepted_at: string | null
              actual_distance_km: number | null
              actual_minutes: number | null
              advance_amount: number
              advance_confirmed_at: string | null
              advance_declared_amount: number
              advance_declared_at: string | null
              advance_proof_url: string | null
              balance_due: number
              budget_approved_amount: number | null
              budget_approved_at: string | null
              budget_estimate: number
              budget_overrun_pending: boolean
              category: Database["public"]["Enums"]["errand_category"]
              city: string
              commission_amount: number
              commission_rate: number
              commission_rule_id: string | null
              created_at: string
              customer_id: string | null
              delivered_at: string | null
              delivering_at: string | null
              delivery_address: string
              delivery_fee: number
              distance_km: number
              dropoff_mode: Database["public"]["Enums"]["dropoff_mode"]
              estimated_minutes: number
              extra_distance_km: number
              fund_mode: Database["public"]["Enums"]["fund_mode"]
              handover_attempts: number
              handover_code: string | null
              handover_locked_at: string | null
              handover_verified_at: string | null
              id: string
              items: Json
              items_total: number
              lat: number | null
              lng: number | null
              notes: string | null
              overrun_approved_at: string | null
              overrun_fee: number
              overtime_minutes: number
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
              shopping_at: string | null
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
            SetofOptions: {
              from: "*"
              to: "errands"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      errand_verify_handover_code: {
        Args: { p_code: string; p_errand_id: string }
        Returns: boolean
      }
      generate_handover_code: { Args: never; Returns: string }
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
      log_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity: string
          p_entity_id?: string
        }
        Returns: undefined
      }
      log_errand_event: {
        Args: {
          p_errand_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["errand_status"]
        }
        Returns: undefined
      }
      notify_claim_batch: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          email: string
          event: string
          id: string
          subject: string
        }[]
      }
      notify_enqueue: {
        Args: {
          p_body: string
          p_errand_id: string
          p_event: string
          p_subject: string
          p_user_id: string
        }
        Returns: undefined
      }
      notify_mark: {
        Args: { p_error?: string; p_id: string; p_state: string }
        Returns: undefined
      }
      payout_request_create: {
        Args: { p_account_id?: string; p_amount: number }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payout_request_settle: {
        Args: {
          p_note?: string
          p_reference?: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["payout_status"]
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_errand_column_grants: { Args: never; Returns: undefined }
      runner_identity_reopen: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "runner_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wallet_release_matured_earnings: { Args: never; Returns: number }
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
      errand_item_state:
        | "requested"
        | "found"
        | "substitute"
        | "accepted"
        | "refused"
        | "unavailable"
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
      notification_channel: "email"
      notification_state: "pending" | "sent" | "failed" | "skipped"
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
      settlement_mode: "direct" | "escrow"
      wallet_entry_kind:
        | "earning"
        | "commission"
        | "advance_refund"
        | "payout"
        | "adjustment"
        | "bonus"
        | "commission_due"
        | "commission_settlement"
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
      errand_item_state: [
        "requested",
        "found",
        "substitute",
        "accepted",
        "refused",
        "unavailable",
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
      notification_channel: ["email"],
      notification_state: ["pending", "sent", "failed", "skipped"],
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
      settlement_mode: ["direct", "escrow"],
      wallet_entry_kind: [
        "earning",
        "commission",
        "advance_refund",
        "payout",
        "adjustment",
        "bonus",
        "commission_due",
        "commission_settlement",
      ],
    },
  },
} as const
