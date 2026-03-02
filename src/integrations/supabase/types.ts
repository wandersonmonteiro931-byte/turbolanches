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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      banners: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          link: string
          sort_order: number
          subtitle: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          link?: string
          sort_order?: number
          subtitle?: string
          title?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          link?: string
          sort_order?: number
          subtitle?: string
          title?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string
          id: string
          image_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          image_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          image_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_uses: number | null
          min_order: number | null
          type: string
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order?: number | null
          type?: string
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order?: number | null
          type?: string
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          lote: string
          neighborhood: string
          number: string
          quadra: string
          state: string
          street: string
          updated_at: string
          user_id: string
          zip_code: string
        }
        Insert: {
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lote?: string
          neighborhood?: string
          number?: string
          quadra?: string
          state?: string
          street?: string
          updated_at?: string
          user_id: string
          zip_code?: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lote?: string
          neighborhood?: string
          number?: string
          quadra?: string
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string | null
          report_date: string
          total_bruto: number
          total_delivery_fees: number
          total_gastos: number
          total_liquido: number
          total_orders: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          report_date: string
          total_bruto?: number
          total_delivery_fees?: number
          total_gastos?: number
          total_liquido?: number
          total_orders?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          report_date?: string
          total_bruto?: number
          total_delivery_fees?: number
          total_gastos?: number
          total_liquido?: number
          total_orders?: number
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          active: boolean
          created_at: string
          delivery_fee: number
          distance_km: number | null
          id: string
          neighborhood: string
          temp_free_delivery: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_fee?: number
          distance_km?: number | null
          id?: string
          neighborhood: string
          temp_free_delivery?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_fee?: number
          distance_km?: number | null
          id?: string
          neighborhood?: string
          temp_free_delivery?: boolean
        }
        Relationships: []
      }
      order_items: {
        Row: {
          addons_json: Json | null
          id: string
          observations: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          addons_json?: Json | null
          id?: string
          observations?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price: number
        }
        Update: {
          addons_json?: Json | null
          id?: string
          observations?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_street: string | null
          cancellation_reason: string | null
          change_for: number | null
          coupon_code: string | null
          created_at: string
          delivered_at: string | null
          delivering_at: string | null
          delivery_fee: number
          delivery_type: string
          discount: number
          id: string
          observations: string | null
          order_number: number
          paid_at: string | null
          payment_confirmed: boolean
          payment_method: string
          pix_copia_cola: string | null
          pix_expiration: string | null
          pix_loc_id: number | null
          pix_qrcode: string | null
          pix_qrcode_image: string | null
          pix_txid: string | null
          preparing_at: string | null
          priority: boolean
          ready_at: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          cancellation_reason?: string | null
          change_for?: number | null
          coupon_code?: string | null
          created_at?: string
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_fee?: number
          delivery_type?: string
          discount?: number
          id?: string
          observations?: string | null
          order_number?: number
          paid_at?: string | null
          payment_confirmed?: boolean
          payment_method?: string
          pix_copia_cola?: string | null
          pix_expiration?: string | null
          pix_loc_id?: number | null
          pix_qrcode?: string | null
          pix_qrcode_image?: string | null
          pix_txid?: string | null
          preparing_at?: string | null
          priority?: boolean
          ready_at?: string | null
          status?: string
          subtotal: number
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          cancellation_reason?: string | null
          change_for?: number | null
          coupon_code?: string | null
          created_at?: string
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_fee?: number
          delivery_type?: string
          discount?: number
          id?: string
          observations?: string | null
          order_number?: number
          paid_at?: string | null
          payment_confirmed?: boolean
          payment_method?: string
          pix_copia_cola?: string | null
          pix_expiration?: string | null
          pix_loc_id?: number | null
          pix_qrcode?: string | null
          pix_qrcode_image?: string | null
          pix_txid?: string | null
          preparing_at?: string | null
          priority?: boolean
          ready_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_addons: {
        Row: {
          active: boolean
          id: string
          name: string
          price: number
          product_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          price?: number
          product_id: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          available_from: string | null
          available_until: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          original_price: number | null
          popular: boolean
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          available_from?: string | null
          available_until?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          original_price?: number | null
          popular?: boolean
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          available_from?: string | null
          available_until?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          original_price?: number | null
          popular?: boolean
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_changes: {
        Row: {
          changed_by: string
          changed_by_role: string
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string
          user_id: string
        }
        Insert: {
          changed_by: string
          changed_by_role?: string
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id: string
          user_id: string
        }
        Update: {
          changed_by?: string
          changed_by_role?: string
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          customer_code: number
          full_name: string
          id: string
          lote: string
          neighborhood: string
          number: string
          phone: string
          quadra: string
          state: string
          street: string
          updated_at: string
          user_id: string
          zip_code: string
        }
        Insert: {
          city?: string
          complement?: string | null
          created_at?: string
          customer_code?: number
          full_name?: string
          id?: string
          lote?: string
          neighborhood?: string
          number?: string
          phone?: string
          quadra?: string
          state?: string
          street?: string
          updated_at?: string
          user_id: string
          zip_code?: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          customer_code?: number
          full_name?: string
          id?: string
          lote?: string
          neighborhood?: string
          number?: string
          phone?: string
          quadra?: string
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: []
      }
      push_notifications: {
        Row: {
          body: string
          created_at: string | null
          failed_count: number | null
          icon: string | null
          id: string
          sent_by: string
          sent_count: number | null
          target_ids: string[] | null
          target_type: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          failed_count?: number | null
          icon?: string | null
          id?: string
          sent_by: string
          sent_count?: number | null
          target_ids?: string[] | null
          target_type?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          failed_count?: number | null
          icon?: string | null
          id?: string
          sent_by?: string
          sent_count?: number | null
          target_ids?: string[] | null
          target_type?: string | null
          title?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      push_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string | null
          id: string
          title: string
          trigger_status: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          body?: string
          created_at?: string | null
          id?: string
          title?: string
          trigger_status: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string | null
          id?: string
          title?: string
          trigger_status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_vapid_keys: {
        Row: {
          created_at: string | null
          id: string
          private_key: string
          public_key: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          private_key: string
          public_key: string
        }
        Update: {
          created_at?: string | null
          id?: string
          private_key?: string
          public_key?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          content_type: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          content_type?: string
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          content_type?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      store_schedule: {
        Row: {
          close_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string | null
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          closed_at: string | null
          created_at: string
          delivery_time_minutes: number
          free_delivery_max_km: number
          free_delivery_min_order: number
          id: string
          is_open: boolean
          max_serving_km: number | null
          max_serving_km_active: boolean
          opened_at: string | null
          pickup_time_minutes: number
          prep_time_minutes: number
          price_per_km: number
          scheduled_close: string | null
          scheduled_open: string | null
          store_address: string
          store_address_full: string
          store_lat: number | null
          store_lng: number | null
          store_neighborhood: string
          temp_free_delivery_all: boolean
          updated_at: string
          use_schedule: boolean
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          delivery_time_minutes?: number
          free_delivery_max_km?: number
          free_delivery_min_order?: number
          id?: string
          is_open?: boolean
          max_serving_km?: number | null
          max_serving_km_active?: boolean
          opened_at?: string | null
          pickup_time_minutes?: number
          prep_time_minutes?: number
          price_per_km?: number
          scheduled_close?: string | null
          scheduled_open?: string | null
          store_address?: string
          store_address_full?: string
          store_lat?: number | null
          store_lng?: number | null
          store_neighborhood?: string
          temp_free_delivery_all?: boolean
          updated_at?: string
          use_schedule?: boolean
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          delivery_time_minutes?: number
          free_delivery_max_km?: number
          free_delivery_min_order?: number
          id?: string
          is_open?: boolean
          max_serving_km?: number | null
          max_serving_km_active?: boolean
          opened_at?: string | null
          pickup_time_minutes?: number
          prep_time_minutes?: number
          price_per_km?: number
          scheduled_close?: string | null
          scheduled_open?: string | null
          store_address?: string
          store_address_full?: string
          store_lat?: number | null
          store_lng?: number | null
          store_neighborhood?: string
          temp_free_delivery_all?: boolean
          updated_at?: string
          use_schedule?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
