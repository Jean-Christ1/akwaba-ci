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
      permissions: {
        Row: {
          code: string
          categorie: string
          libelle: string
          description: string
          sensible: boolean
          position: number
        }
        Insert: { code: string; categorie: string; libelle: string; description: string; sensible?: boolean; position?: number }
        Update: { code?: string; categorie?: string; libelle?: string; description?: string; sensible?: boolean; position?: number }
        Relationships: []
      }
      staff_roles: {
        Row: {
          code: string
          libelle: string
          description: string
          systeme: boolean
          position: number
          created_at: string
        }
        Insert: { code: string; libelle: string; description: string; systeme?: boolean; position?: number }
        Update: { code?: string; libelle?: string; description?: string; systeme?: boolean; position?: number }
        Relationships: []
      }
      role_permissions: {
        Row: { role_code: string; permission_code: string }
        Insert: { role_code: string; permission_code: string }
        Update: { role_code?: string; permission_code?: string }
        Relationships: []
      }
      staff_assignments: {
        Row: {
          user_id: string
          role_code: string
          granted_by: string | null
          granted_at: string
        }
        Insert: { user_id: string; role_code: string; granted_by?: string | null }
        Update: { user_id?: string; role_code?: string; granted_by?: string | null }
        Relationships: []
      }
      user_permissions: {
        Row: {
          user_id: string
          permission_code: string
          accorde: boolean
          motif: string | null
          granted_by: string | null
          granted_at: string
        }
        Insert: { user_id: string; permission_code: string; accorde?: boolean; motif?: string | null }
        Update: { user_id?: string; permission_code?: string; accorde?: boolean; motif?: string | null }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          id: string
          version: number
          label: string
          is_active: boolean
          effective_from: string
          created_at: string
        }
        Insert: { version: number; label: string; is_active?: boolean }
        Update: { version?: number; label?: string; is_active?: boolean }
        Relationships: []
      }
      help_articles: {
        Row: {
          id: string
          slug: string
          categorie: string
          audience: string
          question: string
          reponse: string
          lien_action: string | null
          lien_libelle: string | null
          publie: boolean
          position: number
          updated_at: string
          updated_by: string | null
        }
        Insert: { slug: string; categorie: string; audience?: string; question: string; reponse: string; lien_action?: string | null; lien_libelle?: string | null; publie?: boolean; position?: number }
        Update: { slug?: string; categorie?: string; audience?: string; question?: string; reponse?: string; lien_action?: string | null; lien_libelle?: string | null; publie?: boolean; position?: number }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          libelle: string
          type: string
          valeur: number
          remise_max: number | null
          frais_minimum: number
          ville_slug: string | null
          debut: string
          fin: string | null
          usages_max: number | null
          usages_par_personne: number
          actif: boolean
          created_at: string
        }
        Insert: { code: string; libelle: string; type: string; valeur: number }
        Update: { libelle?: string; type?: string; valeur?: number; actif?: boolean }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          id: string
          code: string
          errand_id: string
          user_id: string | null
          remise: number
          created_at: string
        }
        Insert: { code: string; errand_id: string; user_id?: string | null; remise: number }
        Update: { remise?: number }
        Relationships: []
      }
      runner_trust_levels: {
        Row: {
          code: string
          libelle: string
          description: string
          courses_minimum: number
          note_minimum: number
          anciennete_jours: number
          plafond_avance: number
          position: number
          actif: boolean
          created_at: string
        }
        Insert: { code: string; libelle: string; description: string; plafond_avance: number; position: number }
        Update: { libelle?: string; plafond_avance?: number; actif?: boolean }
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
            referencedRelation: "errand_operations"
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
            referencedRelation: "errand_operations"
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
            referencedRelation: "errand_operations"
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
            referencedRelation: "errand_operations"
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
            referencedRelation: "errand_operations"
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
      errand_schedules: {
        Row: {
          created_at: string
          customer_id: string
          day_of_month: number | null
          day_of_week: number | null
          hour_of_day: number
          id: string
          is_active: boolean
          label: string
          last_run_at: string | null
          next_run_at: string
          rhythm: Database["public"]["Enums"]["schedule_rhythm"]
          runs_count: number
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          day_of_month?: number | null
          day_of_week?: number | null
          hour_of_day?: number
          id?: string
          is_active?: boolean
          label: string
          last_run_at?: string | null
          next_run_at: string
          rhythm: Database["public"]["Enums"]["schedule_rhythm"]
          runs_count?: number
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          day_of_month?: number | null
          day_of_week?: number | null
          hour_of_day?: number
          id?: string
          is_active?: boolean
          label?: string
          last_run_at?: string | null
          next_run_at?: string
          rhythm?: Database["public"]["Enums"]["schedule_rhythm"]
          runs_count?: number
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "errand_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "errand_market_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "errand_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "errand_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "errands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errand_schedules_template_id_fkey"
            columns: ["template_id"]
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
            referencedRelation: "errand_operations"
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
          basket_total: number | null
          basket_proof_url: string | null
          basket_submitted_at: string | null
          basket_approved_at: string | null
          basket_rejected_at: string | null
          basket_note: string | null
          promo_code: string | null
          promo_discount: number
          pricing_rule_id: string | null
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy?: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct?: number
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
          substitution_policy?: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct?: number
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
          partner_reply: string | null
          replied_at: string | null
          replied_by: string | null
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
          partner_reply?: string | null
          replied_at?: string | null
          replied_by?: string | null
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
          partner_reply?: string | null
          replied_at?: string | null
          replied_by?: string | null
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
            referencedRelation: "errand_operations"
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
          whatsapp: string | null
          canal_prefere: string
          whatsapp_consent_at: string | null
          sms_consent_at: string | null
          email_consent_at: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
          suspendu_le: string | null
          suspendu_par: string | null
          suspendu_motif: string | null
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
          date_of_birth: string | null
          id_document_type: string | null
          id_document_expires_on: string | null
          selfie_url: string | null
          identity_submitted_at: string | null
          identity_reviewed_at: string | null
          identity_reviewed_by: string | null
          identity_review_note: string | null
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
      organisation_members: {
        Row: {
          joined_at: string
          organisation_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Insert: {
          joined_at?: string
          organisation_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Update: {
          joined_at?: string
          organisation_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id?: string
        }
        Relationships: []
      }
      organisations: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      merchant_accounts: {
        Row: {
          id: string
          nom: string
          ville: string | null
          place_id: string | null
          user_id: string | null
          moyen: Database["public"]["Enums"]["momo_provider"]
          actif: boolean
          verifie_le: string | null
          verifie_par: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nom: string
          ville?: string | null
          place_id?: string | null
          user_id?: string | null
          moyen: Database["public"]["Enums"]["momo_provider"]
          actif?: boolean
          verifie_le?: string | null
          verifie_par?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nom?: string
          ville?: string | null
          place_id?: string | null
          user_id?: string | null
          moyen?: Database["public"]["Enums"]["momo_provider"]
          actif?: boolean
          verifie_le?: string | null
          verifie_par?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      counter_payments: {
        Row: {
          id: string
          errand_id: string
          plafond: number
          montant: number | null
          merchant_id: string | null
          etat: string
          expire_le: string
          emis_par: string
          emis_le: string
          presente_le: string | null
          demande_le: string | null
          decide_le: string | null
          motif: string | null
          created_at: string
        }
        Insert: {
          id?: string
          errand_id: string
          plafond: number
          montant?: number | null
          merchant_id?: string | null
          etat?: string
          expire_le: string
          emis_par: string
          emis_le?: string
          presente_le?: string | null
          demande_le?: string | null
          decide_le?: string | null
          motif?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          errand_id?: string
          plafond?: number
          montant?: number | null
          merchant_id?: string | null
          etat?: string
          expire_le?: string
          emis_par?: string
          emis_le?: string
          presente_le?: string | null
          demande_le?: string | null
          decide_le?: string | null
          motif?: string | null
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_reglages: {
        Row: {
          unique_ligne: boolean
          secondes_entre_envois: number
          lot_max: number
          heures_avant_abandon: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          unique_ligne?: boolean
          secondes_entre_envois?: number
          lot_max?: number
          heures_avant_abandon?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          unique_ligne?: boolean
          secondes_entre_envois?: number
          lot_max?: number
          heures_avant_abandon?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pricing_surges: {
        Row: {
          id: string
          city_slug: string | null
          multiplicateur: number
          motif: string
          debut: string
          fin: string
          actif: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          city_slug?: string | null
          multiplicateur: number
          motif: string
          debut?: string
          fin: string
          actif?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          city_slug?: string | null
          multiplicateur?: number
          motif?: string
          debut?: string
          fin?: string
          actif?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      service_modes: {
        Row: {
          code: string
          libelle: string
          emoji: string
          exemple: string
          description: string | null
          actif: boolean
          modes_financement: string[]
          exige_panier_valide: boolean
          position: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          libelle: string
          emoji?: string
          exemple?: string
          description?: string | null
          actif?: boolean
          modes_financement?: string[]
          exige_panier_valide?: boolean
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          libelle?: string
          emoji?: string
          exemple?: string
          description?: string | null
          actif?: boolean
          modes_financement?: string[]
          exige_panier_valide?: boolean
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      service_mode_cities: {
        Row: {
          mode_code: string
          city_slug: string
          actif: boolean
        }
        Insert: {
          mode_code: string
          city_slug: string
          actif?: boolean
        }
        Update: {
          mode_code?: string
          city_slug?: string
          actif?: boolean
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
            referencedRelation: "errand_operations"
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
      errand_operations: {
        Row: {
          accepted_at: string | null
          alerte: string | null
          budget_estimate: number | null
          budget_overrun_pending: boolean | null
          category: Database["public"]["Enums"]["errand_category"] | null
          city: string | null
          client_nom: string | null
          client_telephone: string | null
          commission_amount: number | null
          created_at: string | null
          customer_id: string | null
          delivered_at: string | null
          handover_locked_at: string | null
          heures_depuis_creation: number | null
          id: string | null
          offres_en_attente: number | null
          payment_status: Database["public"]["Enums"]["pay_status"] | null
          remplacements_en_attente: number | null
          runner_id: string | null
          service_fee: number | null
          shopper_nom: string | null
          shopper_telephone: string | null
          status: Database["public"]["Enums"]["errand_status"] | null
          substitution_policy:
            | Database["public"]["Enums"]["substitution_policy"]
            | null
          title: string | null
          total_amount: number | null
          zone: string | null
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
            referencedRelation: "errand_operations"
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
          p_settlement?: Database["public"]["Enums"]["settlement_mode"]
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      account_delete_self: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      active_pricing_grid: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      notification_preferences_set: {
        Args: {
          p_canal_prefere: string
          p_whatsapp?: string | null
          p_whatsapp_ok?: boolean | null
          p_sms_ok?: boolean | null
        }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      notification_route: {
        Args: { p_user_id: string }
        Returns: { canal: string; destination: string | null; motif: string | null }[]
      }
      my_permissions: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      errand_submit_basket: {
        Args: { p_errand_id: string; p_total: number; p_proof_url?: string }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_decide_basket: {
        Args: { p_errand_id: string; p_accepte: boolean; p_note?: string }
        Returns: Database["public"]["Tables"]["errands"]["Row"]
      }
      errand_financement_resume: {
        Args: { p_errand_id: string }
        Returns: Json
      }
      runner_advance_ceiling: {
        Args: { p_user_id: string }
        Returns: number
      }
      whatsapp_sante: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      surge_en_vigueur: {
        Args: { p_city?: string | null }
        Returns: {
          id: string
          multiplicateur: number
          motif: string
          fin: string
        }[]
      }
      surge_ouvrir: {
        Args: {
          p_multiplicateur: number
          p_motif: string
          p_minutes?: number
          p_city_slug?: string | null
        }
        Returns: Json
      }
      surge_arreter: {
        Args: { p_id: string }
        Returns: Json
      }
      annuaire_des_comptes: {
        Args: { p_recherche?: string | null; p_limite?: number }
        Returns: {
          user_id: string
          courriel: string | null
          nom_affiche: string | null
          telephone: string | null
          cree_le: string
          suspendu_le: string | null
          suspendu_motif: string | null
          suspendu_par_courriel: string | null
          roles: string[]
          courses: number
        }[]
      }
      compte_suspendre: {
        Args: { p_user_id: string; p_suspendre: boolean; p_motif?: string | null }
        Returns: Json
      }
      message_envoyer: {
        Args: { p_user_id: string; p_sujet: string; p_corps: string }
        Returns: Json
      }
      organisation_gerer: {
        Args: {
          p_org: string
          p_nom?: string | null
          p_contact_email?: string | null
          p_contact_phone?: string | null
        }
        Returns: Database["public"]["Tables"]["organisations"]["Row"]
      }
      acces_a_revoir: {
        Args: { p_jours_sensibles?: number; p_jours_courants?: number }
        Returns: {
          genre: string
          user_id: string
          courriel: string
          intitule: string
          code: string
          perimetre: string
          sensible: boolean
          motif: string | null
          accorde_le: string
          revu_le: string | null
          jours_depuis: number
          echeance: string | null
        }[]
      }
      acces_confirmer_revue: {
        Args: {
          p_genre: string
          p_user_id: string
          p_code: string
          p_scope_value?: string | null
        }
        Returns: Json
      }
      gouvernance_sante: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      mon_perimetre: {
        Args: Record<PropertyKey, never>
        Returns: { restreint: boolean; villes: string[] }[]
      }
      catalogue_des_droits: {
        Args: Record<PropertyKey, never>
        Returns: {
          code: string
          categorie: string
          libelle: string
          description: string | null
          ne_permet_pas: string | null
          sensible: boolean
          portee: string
          rang: number
          roles: string[]
        }[]
      }
      catalogue_des_roles: {
        Args: Record<PropertyKey, never>
        Returns: {
          code: string
          libelle: string
          description: string | null
          niveau: number
          systeme: boolean
          droits: number
          membres: number
        }[]
      }
      permissions_effectives: {
        Args: { _user_id: string }
        Returns: {
          code: string
          libelle: string
          categorie: string
          sensible: boolean
          accordee: boolean
          source: string
          detail: string | null
          perimetre: string
          expire_le: string | null
        }[]
      }
      gouvernance_reconciliation: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          courriel: string
          role_herite: string
          roles_matrice: string
          ecart: string
          gravite: string
        }[]
      }
      has_scoped_permission: {
        Args: { _user_id: string; _code: string; _scope_value?: string | null }
        Returns: boolean
      }
      counter_payment_code: {
        Args: { p_id: string }
        Returns: string
      }
      merchant_rattacher: {
        Args: { p_id: string; p_email: string | null }
        Returns: Json
      }
      lead_traiter: {
        Args: {
          p_id: string
          p_status?: Database["public"]["Enums"]["lead_status"] | null
          p_note?: string | null
          p_reponse?: string | null
        }
        Returns: Json
      }
      lead_note_interne: {
        Args: { p_id: string }
        Returns: string
      }
      merchant_basculer: {
        Args: { p_id: string; p_actif: boolean }
        Returns: Json
      }
      counter_payment_emettre: {
        Args: { p_errand_id: string; p_plafond: number; p_minutes?: number }
        Returns: Json
      }
      counter_payment_lire: {
        Args: { p_code: string }
        Returns: Json
      }
      counter_payment_demander: {
        Args: { p_code: string; p_montant: number; p_merchant_id: string }
        Returns: Json
      }
      counter_payment_decider: {
        Args: { p_id: string; p_accepte: boolean; p_motif?: string | null }
        Returns: Json
      }
      counter_payment_annuler: {
        Args: { p_id: string }
        Returns: Json
      }
      merchant_enregistrer: {
        Args: {
          p_nom: string
          p_moyen: string
          p_numero: string
          p_ville?: string | null
          p_place_id?: string | null
          p_user_id?: string | null
          p_verifier?: boolean
        }
        Returns: Json
      }
      whatsapp_regler: {
        Args: {
          p_secondes_entre_envois?: number | null
          p_lot_max?: number | null
          p_heures_avant_abandon?: number | null
        }
        Returns: Json
      }
      service_modes_ouverts: {
        Args: { p_ville?: string | null }
        Returns: {
          code: string
          libelle: string
          emoji: string
          exemple: string
          description: string | null
          modes_financement: string[]
          exige_panier_valide: boolean
        }[]
      }
      service_mode_regler: {
        Args: {
          p_code: string
          p_actif: boolean
          p_modes_financement?: string[] | null
          p_exige_panier?: boolean | null
          p_villes_fermees?: string[] | null
        }
        Returns: Json
      }
      promo_evaluer: {
        Args: {
          p_code: string
          p_user_id?: string
          p_ville: string
          p_frais: number
          p_commission: number
          p_errand_id?: string
        }
        Returns: Json
      }
      promo_appliquer: {
        Args: { p_errand_id: string; p_code: string }
        Returns: Json
      }
      promo_publier: {
        Args: {
          p_code: string
          p_libelle: string
          p_type: string
          p_valeur: number
          p_remise_max?: number | null
          p_frais_minimum?: number
          p_ville_slug?: string | null
          p_fin?: string | null
          p_usages_max?: number | null
          p_usages_par_personne?: number
          p_actif?: boolean
        }
        Returns: Database["public"]["Tables"]["promo_codes"]["Row"]
      }
      help_article_upsert: {
        Args: {
          p_slug: string
          p_categorie: string
          p_audience: string
          p_question: string
          p_reponse: string
          p_lien_action?: string
          p_lien_libelle?: string
          p_publie?: boolean
          p_position?: number
        }
        Returns: Database["public"]["Tables"]["help_articles"]["Row"]
      }
      has_permission: {
        Args: { _user_id: string; _code: string }
        Returns: boolean
      }
      staff_assign_role: {
        Args: {
          p_user_id: string
          p_role_code: string
          p_accorder?: boolean
          p_scope_value?: string | null
          p_jours?: number | null
          p_motif?: string | null
        }
        Returns: undefined
      }
      staff_set_permission: {
        Args: {
          p_user_id: string
          p_code: string
          p_accorde: boolean
          p_motif?: string | null
          p_jours?: number | null
        }
        Returns: undefined
      }
      runner_submit_identity: {
        Args: {
          p_date_of_birth: string
          p_document_type: string
          p_document_expires: string | null
          p_id_doc_url: string
          p_selfie_url: string
        }
        Returns: Database["public"]["Tables"]["runner_profiles"]["Row"]
      }
      pricing_quote: {
        Args: {
          p_city: string
          p_vehicle: string
          p_volume: string
          p_urgency: string
          p_dropoff: string
          p_distance_km: number
          p_minutes: number
          p_items_count: number
        }
        Returns: Json
      }
      pricing_publish: {
        Args: {
          p_label: string
          p_scalaires: Json
          p_vehicules: Json
          p_villes: Json
        }
        Returns: {
          id: string
          version: number
          label: string
        }[]
      }
      dispute_frozen_amounts: {
        Args: Record<PropertyKey, never>
        Returns: {
          errand_id: string
          gele: number
        }[]
      }
      runner_set_status: {
        Args: { p_reason?: string; p_runner_id: string; p_status: Database["public"]["Enums"]["runner_status"] }
        Returns: unknown
      }
      taches_planifiees: {
        Args: Record<PropertyKey, never>
        Returns: {
          active: boolean
          dernier_debut: string | null
          dernier_message: string | null
          dernier_statut: string | null
          frequence: string
          tache: string
        }[]
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      errand_alert_counts: {
        Args: never
        Returns: {
          alerte: string
          nombre: number
        }[]
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      errand_unlock_handover: {
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      errand_set_organisation: {
        Args: { p_errand_id: string; p_organisation_id: string | null }
        Returns: unknown
      }
      is_org_member: {
        Args: { p_org: string; p_user?: string }
        Returns: boolean
      }
      org_role: {
        Args: { p_org: string; p_user?: string }
        Returns: Database["public"]["Enums"]["org_member_role"]
      }
      organisation_create: {
        Args: { p_contact_email?: string; p_contact_phone?: string; p_name: string }
        Returns: unknown
      }
      organisation_errands: {
        Args: { p_limit?: number; p_org: string }
        Returns: {
          category: Database["public"]["Enums"]["errand_category"]
          city: string
          created_at: string
          demandeur: string
          id: string
          payment_status: Database["public"]["Enums"]["pay_status"]
          service_fee: number
          status: Database["public"]["Enums"]["errand_status"]
          title: string
          total_amount: number
          zone: string | null
        }[]
      }
      organisation_join: {
        Args: { p_code: string }
        Returns: unknown
      }
      organisation_join_code: {
        Args: { p_org: string }
        Returns: string
      }
      organisation_remove_member: {
        Args: { p_org: string; p_user: string }
        Returns: undefined
      }
      organisation_rotate_join_code: {
        Args: { p_org: string }
        Returns: string
      }
      organisation_set_member_role: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["org_member_role"]; p_user: string }
        Returns: undefined
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      errand_duplicate: {
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
      errand_schedule_create: {
        Args: {
          p_day_of_month?: number
          p_day_of_week?: number
          p_errand_id: string
          p_hour?: number
          p_label: string
          p_rhythm: string
        }
        Returns: {
          created_at: string
          customer_id: string
          day_of_month: number | null
          day_of_week: number | null
          hour_of_day: number
          id: string
          is_active: boolean
          label: string
          last_run_at: string | null
          next_run_at: string
          rhythm: Database["public"]["Enums"]["schedule_rhythm"]
          runs_count: number
          template_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "errand_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_schedule_set_active: {
        Args: { p_active: boolean; p_schedule_id: string }
        Returns: {
          created_at: string
          customer_id: string
          day_of_month: number | null
          day_of_week: number | null
          hour_of_day: number
          id: string
          is_active: boolean
          label: string
          last_run_at: string | null
          next_run_at: string
          rhythm: Database["public"]["Enums"]["schedule_rhythm"]
          runs_count: number
          template_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "errand_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      errand_schedules_run_due: {
        Args: { p_limit?: number }
        Returns: {
          errand_id: string
          erreur: string
          schedule_id: string
        }[]
      }
      errand_set_substitution_policy: {
        Args: { p_errand_id: string; p_policy: string; p_tolerance?: number }
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
          substitution_policy: Database["public"]["Enums"]["substitution_policy"]
          substitution_price_tolerance_pct: number
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
              substitution_policy: Database["public"]["Enums"]["substitution_policy"]
              substitution_price_tolerance_pct: number
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
      schedule_next_run: {
        Args: {
          p_day_of_month: number
          p_day_of_week: number
          p_depuis?: string
          p_hour: number
          p_rhythm: Database["public"]["Enums"]["schedule_rhythm"]
        }
        Returns: string
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
        | "parcel"
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
      org_member_role: "owner" | "manager" | "member"
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
      schedule_rhythm: "weekly" | "biweekly" | "monthly"
      settlement_mode: "direct" | "escrow"
      substitution_policy: "never" | "ask" | "similar"
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
        "parcel",
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
      org_member_role: ["owner", "manager", "member"],
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
      schedule_rhythm: ["weekly", "biweekly", "monthly"],
      settlement_mode: ["direct", "escrow"],
      substitution_policy: ["never", "ask", "similar"],
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
