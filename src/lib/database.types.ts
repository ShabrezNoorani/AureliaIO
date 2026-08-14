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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_costs: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          id: string
          label: string
          month: number | null
          user_id: string | null
          year: number | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          id?: string
          label: string
          month?: number | null
          user_id?: string | null
          year?: number | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          id?: string
          label?: string
          month?: number | null
          user_id?: string | null
          year?: number | null
        }
        Relationships: []
      }
      blogs: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          published: boolean | null
          published_at: string | null
          read_time: number | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          published?: boolean | null
          published_at?: string | null
          read_time?: number | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          published?: boolean | null
          published_at?: string | null
          read_time?: number | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          assigned_guide: string | null
          booking_date: string | null
          booking_ref: string | null
          cancellation_type: string | null
          channel: string | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          ext_ref: string | null
          extra_cost: number | null
          gross_revenue: number | null
          guide_cost: number | null
          id: string
          marketplace_fee: number | null
          net_profit: number | null
          net_revenue: number | null
          notes: string | null
          option_name: string | null
          pax_adult: number | null
          pax_child: number | null
          pax_infant: number | null
          pax_youth: number | null
          product_code: string | null
          product_name: string | null
          promo_code: string | null
          status: string | null
          sync_source: string | null
          ticket_cost: number | null
          total_pax: number | null
          travel_date: string | null
          travel_time: string | null
          user_id: string | null
        }
        Insert: {
          assigned_guide?: string | null
          booking_date?: string | null
          booking_ref?: string | null
          cancellation_type?: string | null
          channel?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ext_ref?: string | null
          extra_cost?: number | null
          gross_revenue?: number | null
          guide_cost?: number | null
          id?: string
          marketplace_fee?: number | null
          net_profit?: number | null
          net_revenue?: number | null
          notes?: string | null
          option_name?: string | null
          pax_adult?: number | null
          pax_child?: number | null
          pax_infant?: number | null
          pax_youth?: number | null
          product_code?: string | null
          product_name?: string | null
          promo_code?: string | null
          status?: string | null
          sync_source?: string | null
          ticket_cost?: number | null
          total_pax?: number | null
          travel_date?: string | null
          travel_time?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_guide?: string | null
          booking_date?: string | null
          booking_ref?: string | null
          cancellation_type?: string | null
          channel?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ext_ref?: string | null
          extra_cost?: number | null
          gross_revenue?: number | null
          guide_cost?: number | null
          id?: string
          marketplace_fee?: number | null
          net_profit?: number | null
          net_revenue?: number | null
          notes?: string | null
          option_name?: string | null
          pax_adult?: number | null
          pax_child?: number | null
          pax_infant?: number | null
          pax_youth?: number | null
          product_code?: string | null
          product_name?: string | null
          promo_code?: string | null
          status?: string | null
          sync_source?: string | null
          ticket_cost?: number | null
          total_pax?: number | null
          travel_date?: string | null
          travel_time?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      change_logs: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          description: string | null
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          description?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          description?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      checkins: {
        Row: {
          booking_ref: string
          checked_in_at: string | null
          checked_in_by: string | null
          display_name_override: string | null
          id: string
          notes: string | null
          pax_checked_in: number | null
          status: string | null
          ticket_photo: string | null
          travel_date: string | null
          user_id: string | null
        }
        Insert: {
          booking_ref: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          display_name_override?: string | null
          id?: string
          notes?: string | null
          pax_checked_in?: number | null
          status?: string | null
          ticket_photo?: string | null
          travel_date?: string | null
          user_id?: string | null
        }
        Update: {
          booking_ref?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          display_name_override?: string | null
          id?: string
          notes?: string | null
          pax_checked_in?: number | null
          status?: string | null
          ticket_photo?: string | null
          travel_date?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      guide_assignments: {
        Row: {
          bonus: number | null
          booking_ref: string | null
          calculated_pay: number | null
          checkin_time: string | null
          clients: string | null
          created_at: string | null
          guide_id: string | null
          id: string
          is_paid: boolean | null
          language: string | null
          notes: string | null
          option_name: string | null
          paid_date: string | null
          pax_count: number | null
          product_code: string | null
          rate_override: number | null
          rate_type: string | null
          sync_source: string | null
          total_pay: number | null
          tour_name: string | null
          tour_type: string | null
          travel_date: string | null
          travel_time: string | null
          user_id: string | null
        }
        Insert: {
          bonus?: number | null
          booking_ref?: string | null
          calculated_pay?: number | null
          checkin_time?: string | null
          clients?: string | null
          created_at?: string | null
          guide_id?: string | null
          id?: string
          is_paid?: boolean | null
          language?: string | null
          notes?: string | null
          option_name?: string | null
          paid_date?: string | null
          pax_count?: number | null
          product_code?: string | null
          rate_override?: number | null
          rate_type?: string | null
          sync_source?: string | null
          total_pay?: number | null
          tour_name?: string | null
          tour_type?: string | null
          travel_date?: string | null
          travel_time?: string | null
          user_id?: string | null
        }
        Update: {
          bonus?: number | null
          booking_ref?: string | null
          calculated_pay?: number | null
          checkin_time?: string | null
          clients?: string | null
          created_at?: string | null
          guide_id?: string | null
          id?: string
          is_paid?: boolean | null
          language?: string | null
          notes?: string | null
          option_name?: string | null
          paid_date?: string | null
          pax_count?: number | null
          product_code?: string | null
          rate_override?: number | null
          rate_type?: string | null
          sync_source?: string | null
          total_pay?: number | null
          tour_name?: string | null
          tour_type?: string | null
          travel_date?: string | null
          travel_time?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_assignments_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_option_rates: {
        Row: {
          created_at: string | null
          guide_id: string | null
          id: string
          notes: string | null
          option_name: string | null
          product_code: string
          rate: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          notes?: string | null
          option_name?: string | null
          product_code: string
          rate?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          notes?: string | null
          option_name?: string | null
          product_code?: string
          rate?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_option_rates_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_product_rates: {
        Row: {
          created_at: string | null
          guide_id: string | null
          id: string
          notes: string | null
          product_code: string | null
          rate: number | null
          rate_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          notes?: string | null
          product_code?: string | null
          rate?: number | null
          rate_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          guide_id?: string | null
          id?: string
          notes?: string | null
          product_code?: string | null
          rate?: number | null
          rate_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_product_rates_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_ratings: {
        Row: {
          added_by: string
          created_at: string | null
          guide_id: string
          id: string
          note: string | null
          quantity: number
          source: string | null
          stars: number
          user_id: string
          verified: boolean | null
          verified_at: string | null
        }
        Insert: {
          added_by: string
          created_at?: string | null
          guide_id: string
          id?: string
          note?: string | null
          quantity?: number
          source?: string | null
          stars: number
          user_id: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Update: {
          added_by?: string
          created_at?: string | null
          guide_id?: string
          id?: string
          note?: string | null
          quantity?: number
          source?: string | null
          stars?: number
          user_id?: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_ratings_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          account_holder: string | null
          auth_user_id: string | null
          bank_address: string | null
          bank_name: string | null
          base_rate: number | null
          claim_token: string | null
          claimed_at: string | null
          contract_date: string | null
          contracted: boolean | null
          created_at: string | null
          email: string | null
          guide_number: string | null
          iban: string | null
          id: string
          languages: string | null
          licensed: boolean | null
          name: string
          notes: string | null
          phone: string | null
          siret: string | null
          status: string | null
          swift_code: string | null
          tours_qualified: string | null
          user_id: string | null
          website_consent: boolean | null
          whatsapp: string | null
        }
        Insert: {
          account_holder?: string | null
          auth_user_id?: string | null
          bank_address?: string | null
          bank_name?: string | null
          base_rate?: number | null
          claim_token?: string | null
          claimed_at?: string | null
          contract_date?: string | null
          contracted?: boolean | null
          created_at?: string | null
          email?: string | null
          guide_number?: string | null
          iban?: string | null
          id?: string
          languages?: string | null
          licensed?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          siret?: string | null
          status?: string | null
          swift_code?: string | null
          tours_qualified?: string | null
          user_id?: string | null
          website_consent?: boolean | null
          whatsapp?: string | null
        }
        Update: {
          account_holder?: string | null
          auth_user_id?: string | null
          bank_address?: string | null
          bank_name?: string | null
          base_rate?: number | null
          claim_token?: string | null
          claimed_at?: string | null
          contract_date?: string | null
          contracted?: boolean | null
          created_at?: string | null
          email?: string | null
          guide_number?: string | null
          iban?: string | null
          id?: string
          languages?: string | null
          licensed?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          siret?: string | null
          status?: string | null
          swift_code?: string | null
          tours_qualified?: string | null
          user_id?: string | null
          website_consent?: boolean | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number | null
          generated_at: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          reference_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          generated_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          generated_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      options: {
        Row: {
          bokun_id: string | null
          bokun_rate_id: string | null
          channels: Json | null
          created_at: string | null
          extra_costs: Json | null
          guides: Json | null
          id: string
          name: string | null
          notes: string | null
          product_id: string | null
          rules: Json | null
          user_id: string | null
        }
        Insert: {
          bokun_id?: string | null
          bokun_rate_id?: string | null
          channels?: Json | null
          created_at?: string | null
          extra_costs?: Json | null
          guides?: Json | null
          id?: string
          name?: string | null
          notes?: string | null
          product_id?: string | null
          rules?: Json | null
          user_id?: string | null
        }
        Update: {
          bokun_id?: string | null
          bokun_rate_id?: string | null
          channels?: Json | null
          created_at?: string | null
          extra_costs?: Json | null
          guides?: Json | null
          id?: string
          name?: string | null
          notes?: string | null
          product_id?: string | null
          rules?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bokun_product_id: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          bokun_product_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          bokun_product_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          app_data: Json | null
          autosync_enabled: boolean | null
          autosync_interval: number | null
          bokun_access_key: string | null
          bokun_secret_key: string | null
          checkin_token: string | null
          company_name: string | null
          gsheet_id: string | null
          guide_assignments_sheet_id: string | null
          id: string
          primary_data_source: string | null
          promo_code_used: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          trial_start: string | null
        }
        Insert: {
          app_data?: Json | null
          autosync_enabled?: boolean | null
          autosync_interval?: number | null
          bokun_access_key?: string | null
          bokun_secret_key?: string | null
          checkin_token?: string | null
          company_name?: string | null
          gsheet_id?: string | null
          guide_assignments_sheet_id?: string | null
          id: string
          primary_data_source?: string | null
          promo_code_used?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          trial_start?: string | null
        }
        Update: {
          app_data?: Json | null
          autosync_enabled?: boolean | null
          autosync_interval?: number | null
          bokun_access_key?: string | null
          bokun_secret_key?: string | null
          checkin_token?: string | null
          company_name?: string | null
          gsheet_id?: string | null
          guide_assignments_sheet_id?: string | null
          id?: string
          primary_data_source?: string | null
          promo_code_used?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          trial_start?: string | null
        }
        Relationships: []
      }
      session_bookings: {
        Row: {
          booking_ref: string
          session_id: string
          user_id: string
        }
        Insert: {
          booking_ref: string
          session_id: string
          user_id: string
        }
        Update: {
          booking_ref?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tour_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_guides: {
        Row: {
          guide_id: string
          offered_at: string | null
          reassigned_from: string | null
          responded_at: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          guide_id: string
          offered_at?: string | null
          reassigned_from?: string | null
          responded_at?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          guide_id?: string
          offered_at?: string | null
          reassigned_from?: string | null
          responded_at?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_guides_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_guides_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tour_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_sessions: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          notes: string | null
          start_time: string | null
          tour_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          start_time?: string | null
          tour_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          start_time?: string | null
          tour_date?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_guide_account: { Args: { p_token: string }; Returns: boolean }
      get_claim_info: {
        Args: { p_token: string }
        Returns: {
          guide_email: string
          guide_name: string
        }[]
      }
      my_assigned_booking_refs: { Args: never; Returns: string[] }
      my_company_owner_id: { Args: never; Returns: string }
      my_session_booking_refs: { Args: never; Returns: string[] }
      reassign_my_slot: {
        Args: { p_session_id: string; p_to_guide: string }
        Returns: undefined
      }
      respond_to_offer: {
        Args: { p_accept: boolean; p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
