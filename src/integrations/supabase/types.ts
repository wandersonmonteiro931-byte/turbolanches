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
      addon_product_links: {
        Row: {
          addon_id: string
          id: string
          product_id: string
          store_id: string | null
        }
        Insert: {
          addon_id: string
          id?: string
          product_id: string
          store_id?: string | null
        }
        Update: {
          addon_id?: string
          id?: string
          product_id?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_product_links_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "product_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_product_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_product_links_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          actions: string[] | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          actions?: string[] | null
          content: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          actions?: string[] | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          link: string
          sort_order: number
          store_id: string | null
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
          store_id?: string | null
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
          store_id?: string | null
          subtitle?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_events: {
        Row: {
          cash_register_id: string
          event_at: string
          event_type: string
          id: string
          performed_by: string
          snapshot: Json
          store_id: string | null
        }
        Insert: {
          cash_register_id: string
          event_at?: string
          event_type: string
          id?: string
          performed_by: string
          snapshot?: Json
          store_id?: string | null
        }
        Update: {
          cash_register_id?: string
          event_at?: string
          event_type?: string
          id?: string
          performed_by?: string
          snapshot?: Json
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_events_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          business_day: string
          closed_at: string | null
          closed_by: string | null
          closing_card: number
          closing_cash: number
          closing_pix: number
          created_at: string
          declared_card: number
          declared_cash: number
          declared_gross_card: number
          declared_gross_cash: number
          declared_gross_pix: number
          declared_pix: number
          difference_card: number
          difference_cash: number
          difference_pix: number
          expected_card: number
          expected_cash: number
          expected_pix: number
          expense_ads: number
          expense_ads_external: number
          expense_ads_method: string
          expense_ads_paid: boolean
          expense_couriers: number
          expense_couriers_method: string
          expense_couriers_paid: boolean
          expense_employees: number
          expense_employees_method: string
          expense_employees_paid: boolean
          expense_gasoline: number
          expense_gasoline_method: string
          expense_gasoline_paid: boolean
          expense_other: number
          expense_other_method: string
          expense_other_paid: boolean
          expense_purchases: number
          expense_purchases_method: string
          expense_purchases_paid: boolean
          final_card: number
          final_cash: number
          final_pix: number
          gross_card: number
          gross_cash: number
          gross_pix: number
          gross_profit: number
          id: string
          last_reopened_at: string | null
          net_profit: number
          notes: string
          opened_at: string
          opened_by: string
          opening_card: number
          opening_cash: number
          opening_change_reserve: number
          opening_pix: number
          reopen_count: number
          status: string
          store_id: string | null
          total_expenses: number
          total_sales: number
          updated_at: string
        }
        Insert: {
          business_day: string
          closed_at?: string | null
          closed_by?: string | null
          closing_card?: number
          closing_cash?: number
          closing_pix?: number
          created_at?: string
          declared_card?: number
          declared_cash?: number
          declared_gross_card?: number
          declared_gross_cash?: number
          declared_gross_pix?: number
          declared_pix?: number
          difference_card?: number
          difference_cash?: number
          difference_pix?: number
          expected_card?: number
          expected_cash?: number
          expected_pix?: number
          expense_ads?: number
          expense_ads_external?: number
          expense_ads_method?: string
          expense_ads_paid?: boolean
          expense_couriers?: number
          expense_couriers_method?: string
          expense_couriers_paid?: boolean
          expense_employees?: number
          expense_employees_method?: string
          expense_employees_paid?: boolean
          expense_gasoline?: number
          expense_gasoline_method?: string
          expense_gasoline_paid?: boolean
          expense_other?: number
          expense_other_method?: string
          expense_other_paid?: boolean
          expense_purchases?: number
          expense_purchases_method?: string
          expense_purchases_paid?: boolean
          final_card?: number
          final_cash?: number
          final_pix?: number
          gross_card?: number
          gross_cash?: number
          gross_pix?: number
          gross_profit?: number
          id?: string
          last_reopened_at?: string | null
          net_profit?: number
          notes?: string
          opened_at?: string
          opened_by: string
          opening_card?: number
          opening_cash?: number
          opening_change_reserve?: number
          opening_pix?: number
          reopen_count?: number
          status?: string
          store_id?: string | null
          total_expenses?: number
          total_sales?: number
          updated_at?: string
        }
        Update: {
          business_day?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_card?: number
          closing_cash?: number
          closing_pix?: number
          created_at?: string
          declared_card?: number
          declared_cash?: number
          declared_gross_card?: number
          declared_gross_cash?: number
          declared_gross_pix?: number
          declared_pix?: number
          difference_card?: number
          difference_cash?: number
          difference_pix?: number
          expected_card?: number
          expected_cash?: number
          expected_pix?: number
          expense_ads?: number
          expense_ads_external?: number
          expense_ads_method?: string
          expense_ads_paid?: boolean
          expense_couriers?: number
          expense_couriers_method?: string
          expense_couriers_paid?: boolean
          expense_employees?: number
          expense_employees_method?: string
          expense_employees_paid?: boolean
          expense_gasoline?: number
          expense_gasoline_method?: string
          expense_gasoline_paid?: boolean
          expense_other?: number
          expense_other_method?: string
          expense_other_paid?: boolean
          expense_purchases?: number
          expense_purchases_method?: string
          expense_purchases_paid?: boolean
          final_card?: number
          final_cash?: number
          final_pix?: number
          gross_card?: number
          gross_cash?: number
          gross_pix?: number
          gross_profit?: number
          id?: string
          last_reopened_at?: string | null
          net_profit?: number
          notes?: string
          opened_at?: string
          opened_by?: string
          opening_card?: number
          opening_cash?: number
          opening_change_reserve?: number
          opening_pix?: number
          reopen_count?: number
          status?: string
          store_id?: string | null
          total_expenses?: number
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          image_url?: string | null
          name: string
          sort_order?: number
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          image_url?: string | null
          name?: string
          sort_order?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          first_purchase_only: boolean
          id: string
          max_uses: number | null
          max_uses_per_customer: number | null
          min_order: number | null
          starts_at: string | null
          store_id: string | null
          type: string
          updated_at: string
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          first_purchase_only?: boolean
          id?: string
          max_uses?: number | null
          max_uses_per_customer?: number | null
          min_order?: number | null
          starts_at?: string | null
          store_id?: string | null
          type?: string
          updated_at?: string
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          first_purchase_only?: boolean
          id?: string
          max_uses?: number | null
          max_uses_per_customer?: number | null
          min_order?: number | null
          starts_at?: string | null
          store_id?: string | null
          type?: string
          updated_at?: string
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_daily_fees: {
        Row: {
          courier_id: string
          created_at: string
          day_of_week: number
          fixed_fee: number
          id: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          courier_id: string
          created_at?: string
          day_of_week: number
          fixed_fee?: number
          id?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          courier_id?: string
          created_at?: string
          day_of_week?: number
          fixed_fee?: number
          id?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_daily_fees_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_daily_fees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_locations: {
        Row: {
          accuracy: number | null
          courier_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          courier_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          courier_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          fixed_fee: number
          id: string
          name: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string
          created_at?: string
          fixed_fee?: number
          id?: string
          name: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          fixed_fee?: number
          id?: string
          name?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couriers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
          store_id: string | null
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
          store_id?: string | null
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
          store_id?: string | null
          total_bruto?: number
          total_delivery_fees?: number
          total_gastos?: number
          total_liquido?: number
          total_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          active: boolean
          created_at: string
          delivery_fee: number
          distance_km: number | null
          id: string
          neighborhood: string
          store_id: string | null
          temp_free_delivery: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_fee?: number
          distance_km?: number | null
          id?: string
          neighborhood: string
          store_id?: string | null
          temp_free_delivery?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_fee?: number
          distance_km?: number | null
          id?: string
          neighborhood?: string
          store_id?: string | null
          temp_free_delivery?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          start_time: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          start_time: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          start_time?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          base_salary: number
          cpf: string | null
          created_at: string
          employee_code: string
          face_descriptor: Json | null
          full_name: string
          hire_date: string
          id: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          role: string | null
          store_id: string | null
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          cpf?: string | null
          created_at?: string
          employee_code: string
          face_descriptor?: Json | null
          full_name: string
          hire_date?: string
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          store_id?: string | null
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          cpf?: string | null
          created_at?: string
          employee_code?: string
          face_descriptor?: Json | null
          full_name?: string
          hire_date?: string
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          store_id?: string | null
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_costs: {
        Row: {
          cost_type: string
          created_at: string
          days_duration: number | null
          division_mode: string
          id: string
          items_per_day: number | null
          name: string
          notes: string
          preset_key: string | null
          sort_order: number
          store_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          cost_type?: string
          created_at?: string
          days_duration?: number | null
          division_mode?: string
          id?: string
          items_per_day?: number | null
          name: string
          notes?: string
          preset_key?: string | null
          sort_order?: number
          store_id?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          cost_type?: string
          created_at?: string
          days_duration?: number | null
          division_mode?: string
          id?: string
          items_per_day?: number | null
          name?: string
          notes?: string
          preset_key?: string | null
          sort_order?: number
          store_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "extra_costs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          calculation_config: Json
          calculation_mode: string
          cost_per_unit: number
          created_at: string
          id: string
          is_internal: boolean
          name: string
          store_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          calculation_config?: Json
          calculation_mode?: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          is_internal?: boolean
          name: string
          store_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          calculation_config?: Json
          calculation_mode?: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          is_internal?: boolean
          name?: string
          store_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_justifications: {
        Row: {
          created_at: string
          id: string
          justification: string
          justified_by: string
          occurrence_id: string
          status: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          justification: string
          justified_by: string
          occurrence_id: string
          status?: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          justification?: string
          justified_by?: string
          occurrence_id?: string
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_justifications_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "time_clock_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_justifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          addons_json: Json | null
          id: string
          observations: string | null
          order_id: string
          product_code: number | null
          product_id: string | null
          product_name: string
          quantity: number
          sent_to_kitchen: boolean
          sent_to_kitchen_at: string | null
          unit_price: number
        }
        Insert: {
          addons_json?: Json | null
          id?: string
          observations?: string | null
          order_id: string
          product_code?: number | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sent_to_kitchen?: boolean
          sent_to_kitchen_at?: string | null
          unit_price: number
        }
        Update: {
          addons_json?: Json | null
          id?: string
          observations?: string | null
          order_id?: string
          product_code?: number | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sent_to_kitchen?: boolean
          sent_to_kitchen_at?: string | null
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
          amount_paid_card: number
          amount_paid_cash: number
          amount_paid_pix: number
          cancellation_reason: string | null
          change_for: number | null
          change_given_card: number
          change_given_cash: number
          change_given_pix: number
          charged_at: string | null
          coupon_code: string | null
          courier_id: string | null
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
          restaurant_table_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          table_code: string | null
          table_stage: string
          total: number
          trashed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          amount_paid_card?: number
          amount_paid_cash?: number
          amount_paid_pix?: number
          cancellation_reason?: string | null
          change_for?: number | null
          change_given_card?: number
          change_given_cash?: number
          change_given_pix?: number
          charged_at?: string | null
          coupon_code?: string | null
          courier_id?: string | null
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
          restaurant_table_id?: string | null
          status?: string
          store_id?: string | null
          subtotal: number
          table_code?: string | null
          table_stage?: string
          total: number
          trashed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          amount_paid_card?: number
          amount_paid_cash?: number
          amount_paid_pix?: number
          cancellation_reason?: string | null
          change_for?: number | null
          change_given_card?: number
          change_given_cash?: number
          change_given_pix?: number
          charged_at?: string | null
          coupon_code?: string | null
          courier_id?: string | null
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
          restaurant_table_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          table_code?: string | null
          table_stage?: string
          total?: number
          trashed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_table_id_fkey"
            columns: ["restaurant_table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          created_at: string
          employee_id: string
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          pdf_url: string
          reference_month: number
          reference_year: number
          store_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          pdf_url: string
          reference_month: number
          reference_year: number
          store_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          pdf_url?: string
          reference_month?: number
          reference_year?: number
          store_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons: {
        Row: {
          active: boolean
          apply_to_all: boolean
          id: string
          is_internal: boolean
          name: string
          price: number
          product_id: string | null
          sort_order: number
          store_id: string | null
        }
        Insert: {
          active?: boolean
          apply_to_all?: boolean
          id?: string
          is_internal?: boolean
          name: string
          price?: number
          product_id?: string | null
          sort_order?: number
          store_id?: string | null
        }
        Update: {
          active?: boolean
          apply_to_all?: boolean
          id?: string
          is_internal?: boolean
          name?: string
          price?: number
          product_id?: string | null
          sort_order?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_combo_items: {
        Row: {
          component_product_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          sort_order: number
          store_id: string | null
        }
        Insert: {
          component_product_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          sort_order?: number
          store_id?: string | null
        }
        Update: {
          component_product_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sort_order?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_combo_items_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity?: number
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
          combo_item_count: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_combo: boolean
          manual_cost: number
          name: string
          original_price: number | null
          popular: boolean
          price: number
          product_code: number
          sort_order: number
          store_id: string | null
          store_only: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          available_from?: string | null
          available_until?: string | null
          category_id?: string | null
          combo_item_count?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          manual_cost?: number
          name: string
          original_price?: number | null
          popular?: boolean
          price: number
          product_code: number
          sort_order?: number
          store_id?: string | null
          store_only?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          available_from?: string | null
          available_until?: string | null
          category_id?: string | null
          combo_item_count?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          manual_cost?: number
          name?: string
          original_price?: number | null
          popular?: boolean
          price?: number
          product_code?: number
          sort_order?: number
          store_id?: string | null
          store_only?: boolean
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
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
          store_id: string | null
          title: string
          trigger_status: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          body?: string
          created_at?: string | null
          id?: string
          store_id?: string | null
          title?: string
          trigger_status: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string | null
          id?: string
          store_id?: string | null
          title?: string
          trigger_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
      receipt_templates: {
        Row: {
          body_font_size: number
          body_template: string
          custom_message: string
          footer_message: string
          id: string
          items_font_size: number
          label: string
          label_font_size: number
          logo_image_size: string
          logo_image_url: string | null
          panfleto_image_size: string
          panfleto_image_url: string | null
          print_image_mode: string
          print_image_quality: string
          print_image_url: string | null
          print_image_width_mm: number
          show_customer_code: boolean
          show_driver_field: boolean
          show_max_delivery_time: boolean
          show_obs: boolean
          show_payment_info: boolean
          show_totals_detail: boolean
          show_troco: boolean
          store_id: string | null
          store_name: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_font_size?: number
          body_template?: string
          custom_message?: string
          footer_message?: string
          id?: string
          items_font_size?: number
          label?: string
          label_font_size?: number
          logo_image_size?: string
          logo_image_url?: string | null
          panfleto_image_size?: string
          panfleto_image_url?: string | null
          print_image_mode?: string
          print_image_quality?: string
          print_image_url?: string | null
          print_image_width_mm?: number
          show_customer_code?: boolean
          show_driver_field?: boolean
          show_max_delivery_time?: boolean
          show_obs?: boolean
          show_payment_info?: boolean
          show_totals_detail?: boolean
          show_troco?: boolean
          store_id?: string | null
          store_name?: string
          template_type: string
          updated_at?: string
        }
        Update: {
          body_font_size?: number
          body_template?: string
          custom_message?: string
          footer_message?: string
          id?: string
          items_font_size?: number
          label?: string
          label_font_size?: number
          logo_image_size?: string
          logo_image_url?: string | null
          panfleto_image_size?: string
          panfleto_image_url?: string | null
          print_image_mode?: string
          print_image_quality?: string
          print_image_url?: string | null
          print_image_width_mm?: number
          show_customer_code?: boolean
          show_driver_field?: boolean
          show_max_delivery_time?: boolean
          show_obs?: boolean
          show_payment_info?: boolean
          show_totals_detail?: boolean
          show_troco?: boolean
          store_id?: string | null
          store_name?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      report_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          store_id: string | null
          table_number: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          store_id?: string | null
          table_number: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          store_id?: string | null
          table_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      restock_items: {
        Row: {
          checked: boolean
          created_at: string
          estimated_total: number | null
          id: string
          ingredient_id: string | null
          ingredient_name: string
          last_price: number
          notes: string
          quantity: number
          restock_list_id: string
          sort_order: number
          store_id: string | null
          unit: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          estimated_total?: number | null
          id?: string
          ingredient_id?: string | null
          ingredient_name?: string
          last_price?: number
          notes?: string
          quantity?: number
          restock_list_id: string
          sort_order?: number
          store_id?: string | null
          unit?: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          estimated_total?: number | null
          id?: string
          ingredient_id?: string | null
          ingredient_name?: string
          last_price?: number
          notes?: string
          quantity?: number
          restock_list_id?: string
          sort_order?: number
          store_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restock_items_restock_list_id_fkey"
            columns: ["restock_list_id"]
            isOneToOne: false
            referencedRelation: "restock_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restock_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      restock_lists: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          notes: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_lists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_response: string | null
          comment: string | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          rating: number
          store_id: string | null
          tags: string[] | null
          user_id: string
          visible: boolean | null
        }
        Insert: {
          admin_response?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          rating: number
          store_id?: string | null
          tags?: string[] | null
          user_id: string
          visible?: boolean | null
        }
        Update: {
          admin_response?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          rating?: number
          store_id?: string | null
          tags?: string[] | null
          user_id?: string
          visible?: boolean | null
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
            foreignKeyName: "reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_labels: {
        Row: {
          brand: string
          copies: number
          created_at: string
          height_mm: number
          id: string
          manufactured_on: string
          name: string
          responsible: string
          shelf_life_days: number
          source_kind: string
          storage_phrase: string
          storage_temp: string
          storage_type: string
          store_id: string | null
          updated_at: string
          user_id: string
          valid_until: string
          validity_mode: string
          width_mm: number
        }
        Insert: {
          brand?: string
          copies?: number
          created_at?: string
          height_mm?: number
          id?: string
          manufactured_on?: string
          name: string
          responsible?: string
          shelf_life_days?: number
          source_kind?: string
          storage_phrase?: string
          storage_temp?: string
          storage_type?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string
          validity_mode?: string
          width_mm?: number
        }
        Update: {
          brand?: string
          copies?: number
          created_at?: string
          height_mm?: number
          id?: string
          manufactured_on?: string
          name?: string
          responsible?: string
          shelf_life_days?: number
          source_kind?: string
          storage_phrase?: string
          storage_temp?: string
          storage_type?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string
          validity_mode?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_labels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scratch_prizes: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          name: string
          remaining_quantity: number
          store_id: string | null
          tier: string
          total_quantity: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name: string
          remaining_quantity?: number
          store_id?: string | null
          tier?: string
          total_quantity?: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name?: string
          remaining_quantity?: number
          store_id?: string | null
          tier?: string
          total_quantity?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "scratch_prizes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scratch_settings: {
        Row: {
          fallback_message: string
          id: string
          is_enabled: boolean
          min_order_value: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          fallback_message?: string
          id?: string
          is_enabled?: boolean
          min_order_value?: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          fallback_message?: string
          id?: string
          is_enabled?: boolean
          min_order_value?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scratch_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scratch_wins: {
        Row: {
          coupon_code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string
          found_at: string
          id: string
          no_prize: boolean
          order_id: string | null
          prize_id: string | null
          redeemed_at: string | null
          redeemed_order_id: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          coupon_code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at: string
          found_at?: string
          id?: string
          no_prize?: boolean
          order_id?: string | null
          prize_id?: string | null
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          coupon_code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string
          found_at?: string
          id?: string
          no_prize?: boolean
          order_id?: string | null
          prize_id?: string | null
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scratch_wins_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scratch_wins_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "scratch_prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scratch_wins_redeemed_order_id_fkey"
            columns: ["redeemed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scratch_wins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          content_type: string
          id: string
          key: string
          store_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          content_type?: string
          id?: string
          key: string
          store_id?: string | null
          updated_at?: string
          value?: string
        }
        Update: {
          content_type?: string
          id?: string
          key?: string
          store_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_content_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          employee_code: string | null
          id: string
          is_active: boolean
          role: string
          store_id: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          employee_code?: string | null
          id?: string
          is_active?: boolean
          role: string
          store_id?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          employee_code?: string | null
          id?: string
          is_active?: boolean
          role?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_section_permissions: {
        Row: {
          can_access: boolean
          created_at: string
          id: string
          section_path: string
          staff_member_id: string
        }
        Insert: {
          can_access?: boolean
          created_at?: string
          id?: string
          section_path: string
          staff_member_id: string
        }
        Update: {
          can_access?: boolean
          created_at?: string
          id?: string
          section_path?: string
          staff_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_section_permissions_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_configs: {
        Row: {
          active: boolean
          created_at: string
          default_phrase: string
          default_temp: string
          emoji: string
          id: string
          name: string
          sort_order: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_phrase?: string
          default_temp?: string
          emoji?: string
          id?: string
          name: string
          sort_order?: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_phrase?: string
          default_temp?: string
          emoji?: string
          id?: string
          name?: string
          sort_order?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_configs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_schedule: {
        Row: {
          close_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_schedule_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          closed_at: string | null
          created_at: string
          delivery_time_minutes: number
          entregador_receipt_enabled: boolean
          free_delivery_max_km: number
          free_delivery_min_order: number
          id: string
          is_open: boolean
          max_serving_km: number | null
          max_serving_km_active: boolean
          obrigado_receipt_enabled: boolean
          opened_at: string | null
          pickup_time_minutes: number
          prep_time_minutes: number
          price_per_km: number
          scheduled_close: string | null
          scheduled_open: string | null
          store_address: string
          store_address_full: string
          store_display_name: string
          store_id: string | null
          store_lat: number | null
          store_lng: number | null
          store_logo_url: string
          store_neighborhood: string
          temp_free_delivery_all: boolean
          updated_at: string
          use_schedule: boolean
          whatsapp_name: string
          whatsapp_number: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          delivery_time_minutes?: number
          entregador_receipt_enabled?: boolean
          free_delivery_max_km?: number
          free_delivery_min_order?: number
          id?: string
          is_open?: boolean
          max_serving_km?: number | null
          max_serving_km_active?: boolean
          obrigado_receipt_enabled?: boolean
          opened_at?: string | null
          pickup_time_minutes?: number
          prep_time_minutes?: number
          price_per_km?: number
          scheduled_close?: string | null
          scheduled_open?: string | null
          store_address?: string
          store_address_full?: string
          store_display_name?: string
          store_id?: string | null
          store_lat?: number | null
          store_lng?: number | null
          store_logo_url?: string
          store_neighborhood?: string
          temp_free_delivery_all?: boolean
          updated_at?: string
          use_schedule?: boolean
          whatsapp_name?: string
          whatsapp_number?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          delivery_time_minutes?: number
          entregador_receipt_enabled?: boolean
          free_delivery_max_km?: number
          free_delivery_min_order?: number
          id?: string
          is_open?: boolean
          max_serving_km?: number | null
          max_serving_km_active?: boolean
          obrigado_receipt_enabled?: boolean
          opened_at?: string | null
          pickup_time_minutes?: number
          prep_time_minutes?: number
          price_per_km?: number
          scheduled_close?: string | null
          scheduled_open?: string | null
          store_address?: string
          store_address_full?: string
          store_display_name?: string
          store_id?: string | null
          store_lat?: number | null
          store_lng?: number | null
          store_logo_url?: string
          store_neighborhood?: string
          temp_free_delivery_all?: boolean
          updated_at?: string
          use_schedule?: boolean
          whatsapp_name?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
          whatsapp_name: string
          whatsapp_number: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          owner_user_id: string
          slug?: string
          updated_at?: string
          whatsapp_name?: string
          whatsapp_number?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
          whatsapp_name?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      time_clock_occurrences: {
        Row: {
          created_at: string
          details: string | null
          detected_at: string
          employee_id: string
          id: string
          minutes_delta: number | null
          occurrence_date: string
          occurrence_type: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          detected_at?: string
          employee_id: string
          id?: string
          minutes_delta?: number | null
          occurrence_date: string
          occurrence_type: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          detected_at?: string
          employee_id?: string
          id?: string
          minutes_delta?: number | null
          occurrence_date?: string
          occurrence_type?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_occurrences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_occurrences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_punches: {
        Row: {
          business_day: string
          created_at: string
          device_info: string | null
          distance_meters: number | null
          employee_id: string
          face_match_score: number | null
          id: string
          lat: number | null
          lng: number | null
          punch_type: string
          punched_at: string
          selfie_url: string | null
          store_id: string | null
        }
        Insert: {
          business_day?: string
          created_at?: string
          device_info?: string | null
          distance_meters?: number | null
          employee_id: string
          face_match_score?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          punch_type: string
          punched_at?: string
          selfie_url?: string | null
          store_id?: string | null
        }
        Update: {
          business_day?: string
          created_at?: string
          device_info?: string | null
          distance_meters?: number | null
          employee_id?: string
          face_match_score?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          punch_type?: string
          punched_at?: string
          selfie_url?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_punches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_settings: {
        Row: {
          allowed_radius_meters: number
          created_at: string
          face_match_threshold: number
          id: string
          late_tolerance_minutes: number
          require_face_match: boolean
          require_geolocation: boolean
          store_id: string | null
          store_lat: number | null
          store_lng: number | null
          updated_at: string
        }
        Insert: {
          allowed_radius_meters?: number
          created_at?: string
          face_match_threshold?: number
          id?: string
          late_tolerance_minutes?: number
          require_face_match?: boolean
          require_geolocation?: boolean
          store_id?: string | null
          store_lat?: number | null
          store_lng?: number | null
          updated_at?: string
        }
        Update: {
          allowed_radius_meters?: number
          created_at?: string
          face_match_threshold?: number
          id?: string
          late_tolerance_minutes?: number
          require_face_match?: boolean
          require_geolocation?: boolean
          store_id?: string | null
          store_lat?: number | null
          store_lng?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_ads: {
        Row: {
          active: boolean
          created_at: string
          duration_seconds: number
          id: string
          image_url: string
          sort_order: number
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_seconds?: number
          id?: string
          image_url?: string
          sort_order?: number
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_seconds?: number
          id?: string
          image_url?: string
          sort_order?: number
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      unpaid_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string
          paid: boolean
          paid_at: string | null
          paid_method: string | null
          registered_at: string
          source: string
          source_ref: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string
          paid?: boolean
          paid_at?: string | null
          paid_method?: string | null
          registered_at?: string
          source?: string
          source_ref?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string
          paid?: boolean
          paid_at?: string | null
          paid_method?: string | null
          registered_at?: string
          source?: string
          source_ref?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_owns_store_row: { Args: { _store_id: string }; Returns: boolean }
      can_manage_staff: { Args: { _user_id: string }; Returns: boolean }
      create_scratch_coupon: {
        Args: {
          _code: string
          _expires_at: string
          _store_id?: string
          _type: string
          _value: number
        }
        Returns: undefined
      }
      get_admin_store_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_section_access: {
        Args: { _section_path: string; _user_id: string }
        Returns: boolean
      }
      increment_coupon_used_count: {
        Args: { _code: string }
        Returns: undefined
      }
      next_employee_code: { Args: never; Returns: string }
      next_product_code: { Args: { _category_id: string }; Returns: number }
      next_staff_employee_code: {
        Args: { _store_id?: string }
        Returns: string
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
