export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      courier_stripe_accounts: {
        Row: {
          charges_enabled: boolean;
          courier_id: string;
          details_submitted: boolean;
          payouts_enabled: boolean;
          stripe_account_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          charges_enabled?: boolean;
          courier_id: string;
          details_submitted?: boolean;
          payouts_enabled?: boolean;
          stripe_account_id: string;
          updated_at?: string;
        };
        Update: {
          charges_enabled?: boolean;
          courier_id?: string;
          details_submitted?: boolean;
          payouts_enabled?: boolean;
          stripe_account_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'courier_stripe_accounts_courier_id_fkey';
            columns: ['courier_id'];
            isOneToOne: true;
            referencedRelation: 'couriers';
            referencedColumns: ['id'];
          },
        ];
      };
      courier_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          courier_id: string;
          current_period_end: string | null;
          status: Database['public']['Enums']['subscription_status'];
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          trial_end: string | null;
          trial_used: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_at_period_end?: boolean;
          courier_id: string;
          current_period_end?: string | null;
          status?: Database['public']['Enums']['subscription_status'];
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          courier_id?: string;
          current_period_end?: string | null;
          status?: Database['public']['Enums']['subscription_status'];
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'courier_subscriptions_courier_id_fkey';
            columns: ['courier_id'];
            isOneToOne: true;
            referencedRelation: 'couriers';
            referencedColumns: ['id'];
          },
        ];
      };
      couriers: {
        Row: {
          payment_link: string | null;
          photo_url: string | null;
          work_zone: string | null;
          created_at: string;
          display_name: string;
          id: string;
          available_until: string | null;
          is_available: boolean;
          is_online: boolean | null;
          last_assigned_at: string | null;
          legal_status: Database['public']['Enums']['courier_legal_status'];
          phone: string;
          siret: string;
          updated_at: string;
          user_id: string;
          vehicle: Database['public']['Enums']['courier_vehicle'];
        };
        ComputedFields: 'is_online';
        Insert: {
          payment_link?: string | null;
          photo_url?: string | null;
          work_zone?: string | null;
          created_at?: string;
          display_name: string;
          id?: string;
          available_until?: string | null;
          is_available?: boolean;
          last_assigned_at?: string | null;
          legal_status: Database['public']['Enums']['courier_legal_status'];
          phone: string;
          siret: string;
          updated_at?: string;
          user_id: string;
          vehicle?: Database['public']['Enums']['courier_vehicle'];
        };
        Update: {
          payment_link?: string | null;
          photo_url?: string | null;
          work_zone?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          available_until?: string | null;
          is_available?: boolean;
          last_assigned_at?: string | null;
          legal_status?: Database['public']['Enums']['courier_legal_status'];
          phone?: string;
          siret?: string;
          updated_at?: string;
          user_id?: string;
          vehicle?: Database['public']['Enums']['courier_vehicle'];
        };
        Relationships: [
          {
            foreignKeyName: 'couriers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_addresses: {
        Row: {
          address_line: string;
          city: string;
          created_at: string;
          id: string;
          instructions: string | null;
          is_default: boolean;
          label: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          address_line: string;
          city: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_default?: boolean;
          label: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          user_id: string;
        };
        Update: {
          address_line?: string;
          city?: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_default?: boolean;
          label?: string;
          latitude?: number;
          longitude?: number;
          postal_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_addresses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_favorites: {
        Row: {
          created_at: string;
          merchant_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          merchant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          merchant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_favorites_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      loyalty_cards: {
        Row: {
          merchant_id: string;
          paid_menus_count: number;
          rewards_available: number;
          rewards_redeemed: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          merchant_id: string;
          paid_menus_count?: number;
          rewards_available?: number;
          rewards_redeemed?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          merchant_id?: string;
          paid_menus_count?: number;
          rewards_available?: number;
          rewards_redeemed?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loyalty_cards_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loyalty_cards_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_categories: {
        Row: {
          id: string;
          is_active: boolean;
          merchant_id: string;
          name: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          merchant_id: string;
          name: string;
          position?: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          merchant_id?: string;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_categories_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_items: {
        Row: {
          category_id: string;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_available: boolean;
          is_formula: boolean;
          is_in_slot_now: boolean | null;
          is_loyalty_menu: boolean;
          meal_periods: string[];
          merchant_id: string;
          name: string;
          position: number;
          price_cents: number;
          updated_at: string;
        };
        ComputedFields: 'is_in_slot_now';
        Insert: {
          category_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          is_formula?: boolean;
          is_loyalty_menu?: boolean;
          meal_periods?: string[];
          merchant_id: string;
          name: string;
          position?: number;
          price_cents: number;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          is_formula?: boolean;
          is_loyalty_menu?: boolean;
          meal_periods?: string[];
          merchant_id?: string;
          name?: string;
          position?: number;
          price_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_items_category_id_merchant_id_fkey';
            columns: ['category_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'menu_categories';
            referencedColumns: ['id', 'merchant_id'];
          },
          {
            foreignKeyName: 'menu_items_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_option_groups: {
        Row: {
          id: string;
          item_id: string;
          max_select: number;
          merchant_id: string;
          min_select: number;
          name: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          item_id: string;
          max_select?: number;
          merchant_id: string;
          min_select?: number;
          name: string;
          position?: number;
        };
        Update: {
          id?: string;
          item_id?: string;
          max_select?: number;
          merchant_id?: string;
          min_select?: number;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_option_groups_item_id_merchant_id_fkey';
            columns: ['item_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id', 'merchant_id'];
          },
          {
            foreignKeyName: 'menu_option_groups_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_options: {
        Row: {
          group_id: string;
          id: string;
          is_available: boolean;
          merchant_id: string;
          name: string;
          position: number;
          price_delta_cents: number;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          id?: string;
          is_available?: boolean;
          merchant_id: string;
          name: string;
          position?: number;
          price_delta_cents?: number;
        };
        Update: {
          group_id?: string;
          id?: string;
          is_available?: boolean;
          merchant_id?: string;
          name?: string;
          position?: number;
          price_delta_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_options_group_id_merchant_id_fkey';
            columns: ['group_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'menu_option_groups';
            referencedColumns: ['id', 'merchant_id'];
          },
          {
            foreignKeyName: 'menu_options_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_couriers: {
        Row: {
          courier_id: string;
          decided_at: string | null;
          merchant_id: string;
          requested_at: string;
          status: Database['public']['Enums']['courier_link_status'];
        };
        ComputedFields: never;
        Insert: {
          courier_id: string;
          decided_at?: string | null;
          merchant_id: string;
          requested_at?: string;
          status?: Database['public']['Enums']['courier_link_status'];
        };
        Update: {
          courier_id?: string;
          decided_at?: string | null;
          merchant_id?: string;
          requested_at?: string;
          status?: Database['public']['Enums']['courier_link_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_couriers_courier_id_fkey';
            columns: ['courier_id'];
            isOneToOne: false;
            referencedRelation: 'couriers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_couriers_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      basket_reservations: {
        Row: {
          basket_id: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          created_at: string;
          customer_id: string | null;
          customer_name: string | null;
          id: string;
          merchant_id: string;
          pickup_code: string;
          quantity: number;
          status: string;
          unit_price_cents: number;
        };
        ComputedFields: never;
        Insert: {
          basket_id: string;
          id?: string;
          merchant_id: string;
          quantity: number;
          unit_price_cents: number;
        };
        Update: { status?: string };
        Relationships: [
          {
            foreignKeyName: 'basket_reservations_basket_id_merchant_id_fkey';
            columns: ['basket_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'surprise_baskets';
            referencedColumns: ['id', 'merchant_id'];
          },
          {
            foreignKeyName: 'basket_reservations_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      surprise_baskets: {
        Row: {
          allergens: string[];
          allergens_confirmed: boolean;
          contents: string | null;
          created_at: string;
          estimated_value_cents: number | null;
          id: string;
          is_active: boolean;
          is_reservable: boolean | null;
          is_surprise: boolean;
          merchant_id: string;
          pickup_ends_at: string;
          pickup_starts_at: string;
          price_cents: number;
          quantity_reserved: number;
          quantity_total: number;
          title: string;
        };
        ComputedFields: 'is_reservable';
        Insert: {
          merchant_id: string;
          pickup_ends_at: string;
          pickup_starts_at: string;
          price_cents: number;
          quantity_total: number;
          title: string;
        };
        Update: { is_active?: boolean };
        Relationships: [
          {
            foreignKeyName: 'surprise_baskets_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      happy_hour_items: {
        Row: {
          happy_hour_id: string;
          item_id: string;
          merchant_id: string;
          promo_price_cents: number | null;
        };
        ComputedFields: never;
        Insert: {
          happy_hour_id: string;
          item_id: string;
          merchant_id: string;
          promo_price_cents?: number | null;
        };
        Update: {
          happy_hour_id?: string;
          item_id?: string;
          merchant_id?: string;
          promo_price_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'happy_hour_items_happy_hour_id_merchant_id_fkey';
            columns: ['happy_hour_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'happy_hours';
            referencedColumns: ['id', 'merchant_id'];
          },
          {
            foreignKeyName: 'happy_hour_items_item_id_merchant_id_fkey';
            columns: ['item_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id', 'merchant_id'];
          },
        ];
      };
      happy_hour_slots: {
        Row: {
          ends_at: string;
          happy_hour_id: string;
          id: string;
          merchant_id: string;
          starts_at: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          ends_at: string;
          happy_hour_id: string;
          id?: string;
          merchant_id: string;
          starts_at: string;
          weekday: number;
        };
        Update: {
          ends_at?: string;
          happy_hour_id?: string;
          id?: string;
          merchant_id?: string;
          starts_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'happy_hour_slots_happy_hour_id_merchant_id_fkey';
            columns: ['happy_hour_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'happy_hours';
            referencedColumns: ['id', 'merchant_id'];
          },
        ];
      };
      happy_hours: {
        Row: {
          applies_to_delivery: boolean;
          applies_to_pickup: boolean;
          created_at: string;
          discount_type: string;
          ends_on: string | null;
          id: string;
          is_active: boolean;
          merchant_id: string;
          name: string;
          percent_off: number | null;
          quantity_limit: number | null;
          quantity_used: number;
          starts_on: string | null;
        };
        ComputedFields: never;
        Insert: {
          applies_to_delivery?: boolean;
          applies_to_pickup?: boolean;
          created_at?: string;
          discount_type: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_id: string;
          name: string;
          percent_off?: number | null;
          quantity_limit?: number | null;
          quantity_used?: number;
          starts_on?: string | null;
        };
        Update: {
          applies_to_delivery?: boolean;
          applies_to_pickup?: boolean;
          created_at?: string;
          discount_type?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_id?: string;
          name?: string;
          percent_off?: number | null;
          quantity_limit?: number | null;
          quantity_used?: number;
          starts_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'happy_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_item_slots: {
        Row: {
          ends_at: string;
          id: string;
          item_id: string;
          merchant_id: string;
          starts_at: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          ends_at: string;
          id?: string;
          item_id: string;
          merchant_id: string;
          starts_at: string;
          weekday: number;
        };
        Update: {
          ends_at?: string;
          id?: string;
          item_id?: string;
          merchant_id?: string;
          starts_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_item_slots_item_id_merchant_id_fkey';
            columns: ['item_id', 'merchant_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id', 'merchant_id'];
          },
        ];
      };
      merchant_closures: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          merchant_id: string;
          reason: string | null;
          starts_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          merchant_id: string;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          merchant_id?: string;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_closures_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_opening_hours: {
        Row: {
          closes_at: string;
          id: string;
          merchant_id: string;
          opens_at: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          closes_at: string;
          id?: string;
          merchant_id: string;
          opens_at: string;
          weekday: number;
        };
        Update: {
          closes_at?: string;
          id?: string;
          merchant_id?: string;
          opens_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_opening_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_stripe_accounts: {
        Row: {
          charges_enabled: boolean;
          details_submitted: boolean;
          merchant_id: string;
          payouts_enabled: boolean;
          stripe_account_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          charges_enabled?: boolean;
          details_submitted?: boolean;
          merchant_id: string;
          payouts_enabled?: boolean;
          stripe_account_id: string;
          updated_at?: string;
        };
        Update: {
          charges_enabled?: boolean;
          details_submitted?: boolean;
          merchant_id?: string;
          payouts_enabled?: boolean;
          stripe_account_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_stripe_accounts_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      merchants: {
        Row: {
          payment_link: string | null;
          photo_url: string | null;
          legal_name: string | null;
          siret: string | null;
          vat_number: string | null;
          contact_email: string | null;
          address_line: string;
          category: string;
          city: string;
          created_at: string;
          default_prep_minutes: number;
          delivery_enabled: boolean;
          delivery_fee_cents: number;
          delivery_radius_m: number;
          accepts_cash_pickup: boolean;
          logo_url: string | null;
          tagline: string | null;
          about: string | null;
          accent_color: string | null;
          offers_pickup: boolean;
          pickup_instructions: string | null;
          description: string | null;
          id: string;
          is_paused: boolean;
          is_published: boolean;
          latitude: number;
          location: unknown;
          longitude: number;
          name: string;
          owner_id: string;
          paused_until: string | null;
          phone: string | null;
          postal_code: string;
          slug: string;
          timezone: string;
          updated_at: string;
          is_accepting_orders: boolean | null;
          is_open_now: boolean | null;
          is_paused_now: boolean | null;
          is_payments_ready: boolean | null;
          is_subscription_active: boolean | null;
          has_delivery_option: boolean | null;
          delivery_available_now: boolean | null;
          has_happy_hour_now: boolean | null;
          has_minisite: boolean | null;
          has_order_mode: boolean | null;
          offers_delivery: boolean | null;
        };
        ComputedFields:
          | 'delivery_available_now'
          | 'has_delivery_option'
          | 'has_happy_hour_now'
          | 'has_minisite'
          | 'has_order_mode'
          | 'offers_delivery'
          | 'is_accepting_orders'
          | 'is_open_now'
          | 'is_paused_now'
          | 'is_payments_ready'
          | 'is_subscription_active';
        Insert: {
          payment_link?: string | null;
          photo_url?: string | null;
          legal_name?: string | null;
          siret?: string | null;
          vat_number?: string | null;
          contact_email?: string | null;
          address_line: string;
          category: string;
          city: string;
          created_at?: string;
          default_prep_minutes?: number;
          delivery_enabled?: boolean;
          delivery_fee_cents?: number;
          delivery_radius_m?: number;
          accepts_cash_pickup?: boolean;
          logo_url?: string | null;
          tagline?: string | null;
          about?: string | null;
          accent_color?: string | null;
          offers_pickup?: boolean;
          pickup_instructions?: string | null;
          description?: string | null;
          id?: string;
          is_paused?: boolean;
          is_published?: boolean;
          latitude: number;
          location?: never;
          longitude: number;
          name: string;
          owner_id: string;
          paused_until?: string | null;
          phone?: string | null;
          postal_code: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          payment_link?: string | null;
          photo_url?: string | null;
          legal_name?: string | null;
          siret?: string | null;
          vat_number?: string | null;
          contact_email?: string | null;
          address_line?: string;
          category?: string;
          city?: string;
          created_at?: string;
          default_prep_minutes?: number;
          delivery_enabled?: boolean;
          delivery_fee_cents?: number;
          delivery_radius_m?: number;
          accepts_cash_pickup?: boolean;
          logo_url?: string | null;
          tagline?: string | null;
          about?: string | null;
          accent_color?: string | null;
          offers_pickup?: boolean;
          pickup_instructions?: string | null;
          description?: string | null;
          id?: string;
          is_paused?: boolean;
          is_published?: boolean;
          latitude?: number;
          location?: never;
          longitude?: number;
          name?: string;
          owner_id?: string;
          paused_until?: string | null;
          phone?: string | null;
          postal_code?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchants_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          happy_hour_id: string | null;
          happy_hour_name: string | null;
          id: string;
          is_loyalty_menu: boolean;
          is_loyalty_reward: boolean;
          line_total_cents: number;
          menu_item_id: string | null;
          name: string;
          options: NonNullable<Json>;
          order_id: string;
          quantity: number;
          regular_unit_cents: number | null;
          unit_price_cents: number;
        };
        ComputedFields: never;
        Insert: {
          happy_hour_id?: string | null;
          happy_hour_name?: string | null;
          id?: string;
          is_loyalty_menu?: boolean;
          is_loyalty_reward?: boolean;
          line_total_cents: number;
          menu_item_id?: string | null;
          name: string;
          options?: NonNullable<Json>;
          order_id: string;
          quantity: number;
          regular_unit_cents?: number | null;
          unit_price_cents: number;
        };
        Update: {
          happy_hour_id?: string | null;
          happy_hour_name?: string | null;
          id?: string;
          is_loyalty_menu?: boolean;
          is_loyalty_reward?: boolean;
          line_total_cents?: number;
          menu_item_id?: string | null;
          name?: string;
          options?: NonNullable<Json>;
          order_id?: string;
          quantity?: number;
          regular_unit_cents?: number | null;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_reviews: {
        Row: {
          comment: string | null;
          courier_id: string | null;
          courier_stars: number | null;
          created_at: string;
          customer_id: string | null;
          merchant_id: string;
          merchant_stars: number | null;
          order_id: string;
        };
        ComputedFields: never;
        Insert: {
          comment?: string | null;
          courier_id?: string | null;
          courier_stars?: number | null;
          created_at?: string;
          customer_id?: string | null;
          merchant_id: string;
          merchant_stars?: number | null;
          order_id: string;
        };
        Update: {
          comment?: string | null;
          courier_id?: string | null;
          courier_stars?: number | null;
          created_at?: string;
          customer_id?: string | null;
          merchant_id?: string;
          merchant_stars?: number | null;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_reviews_courier_id_fkey';
            columns: ['courier_id'];
            isOneToOne: false;
            referencedRelation: 'couriers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_reviews_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_reviews_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_reviews_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          meal_payment_declared_at: string | null;
          delivery_payment_declared_at: string | null;
          delivery_unclaimed_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          meal_payment_declared_at?: string | null;
          delivery_payment_declared_at?: string | null;
          delivery_unclaimed_at?: string | null;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          collected_at?: string | null;
          courier_accepted_at?: string | null;
          courier_id?: string | null;
          courier_name?: string | null;
          courier_stripe_account_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_departed_at?: string | null;
          customer_eta_at?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_note?: string | null;
          customer_travel_mode?: Database['public']['Enums']['travel_mode'] | null;
          delivered_at?: string | null;
          delivery_address_line?: string | null;
          delivery_authorized_at?: string | null;
          delivery_checkout_session_id?: string | null;
          delivery_city?: string | null;
          delivery_code?: string | null;
          delivery_distance_m?: number | null;
          delivery_fee_cents?: number;
          delivery_instructions?: string | null;
          delivery_latitude?: number | null;
          delivery_longitude?: number | null;
          delivery_paid_at?: string | null;
          delivery_payment_due_at?: string | null;
          delivery_payment_method?: Database['public']['Enums']['payment_method'];
          meal_payment_method?: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id?: string | null;
          delivery_phone?: string | null;
          delivery_postal_code?: string | null;
          discount_cents?: number;
          estimated_ready_at?: string | null;
          fulfillment?: Database['public']['Enums']['fulfillment_type'];
          id?: string;
          is_loyalty_reward?: boolean;
          loyalty_counted?: boolean;
          meal_authorized_at?: string | null;
          merchant_id: string;
          out_for_delivery_at?: string | null;
          paid_at?: string | null;
          pickup_code?: string;
          placed_at?: string | null;
          prep_minutes?: number | null;
          ready_at?: string | null;
          refusal_reason?: string | null;
          status?: Database['public']['Enums']['order_status'];
          stripe_account_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at?: string;
        };
        Update: {
          meal_payment_declared_at?: string | null;
          delivery_payment_declared_at?: string | null;
          delivery_unclaimed_at?: string | null;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          collected_at?: string | null;
          courier_accepted_at?: string | null;
          courier_id?: string | null;
          courier_name?: string | null;
          courier_stripe_account_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_departed_at?: string | null;
          customer_eta_at?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_note?: string | null;
          customer_travel_mode?: Database['public']['Enums']['travel_mode'] | null;
          delivered_at?: string | null;
          delivery_address_line?: string | null;
          delivery_authorized_at?: string | null;
          delivery_checkout_session_id?: string | null;
          delivery_city?: string | null;
          delivery_code?: string | null;
          delivery_distance_m?: number | null;
          delivery_fee_cents?: number;
          delivery_instructions?: string | null;
          delivery_latitude?: number | null;
          delivery_longitude?: number | null;
          delivery_paid_at?: string | null;
          delivery_payment_due_at?: string | null;
          delivery_payment_method?: Database['public']['Enums']['payment_method'];
          meal_payment_method?: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id?: string | null;
          delivery_phone?: string | null;
          delivery_postal_code?: string | null;
          discount_cents?: number;
          estimated_ready_at?: string | null;
          fulfillment?: Database['public']['Enums']['fulfillment_type'];
          id?: string;
          is_loyalty_reward?: boolean;
          loyalty_counted?: boolean;
          meal_authorized_at?: string | null;
          merchant_id?: string;
          out_for_delivery_at?: string | null;
          paid_at?: string | null;
          pickup_code?: string;
          placed_at?: string | null;
          prep_minutes?: number | null;
          ready_at?: string | null;
          refusal_reason?: string | null;
          status?: Database['public']['Enums']['order_status'];
          stripe_account_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_courier_id_fkey';
            columns: ['courier_id'];
            isOneToOne: false;
            referencedRelation: 'couriers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          locale: string;
          phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          locale?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          locale?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          expo_token: string;
          id: string;
          last_seen_at: string;
          platform: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          expo_token: string;
          id?: string;
          last_seen_at?: string;
          platform: string;
          user_id: string;
        };
        Update: {
          expo_token?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          received_at: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          received_at?: string;
          type: string;
        };
        Update: {
          id?: string;
          received_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          current_period_end: string | null;
          merchant_id: string;
          plan: string;
          status: Database['public']['Enums']['subscription_status'];
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          trial_end: string | null;
          trial_used: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_at_period_end?: boolean;
          current_period_end?: string | null;
          merchant_id: string;
          plan?: string;
          status?: Database['public']['Enums']['subscription_status'];
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          current_period_end?: string | null;
          merchant_id?: string;
          plan?: string;
          status?: Database['public']['Enums']['subscription_status'];
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_order_transition: {
        Args: {
          p_actor: string;
          p_order_id: string;
          p_pickup_code?: string;
          p_prep_minutes?: number;
          p_refusal_reason?: string;
          p_status: Database['public']['Enums']['order_status'];
        };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      available_missions: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accepted_at: string | null;
          delivery_city: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_postal_code: string | null;
          estimated_ready_at: string | null;
          merchant_address: string;
          merchant_city: string;
          merchant_id: string;
          merchant_name: string;
          order_id: string;
          payment_method: Database['public']['Enums']['payment_method'];
          status: Database['public']['Enums']['order_status'];
        }[];
      };
      available_couriers: {
        Args: { p_merchant_id: string };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          is_available: boolean;
          last_assigned_at: string | null;
          legal_status: Database['public']['Enums']['courier_legal_status'];
          phone: string;
          siret: string;
          updated_at: string;
          user_id: string;
          vehicle: Database['public']['Enums']['courier_vehicle'];
        }[];
        SetofOptions: {
          from: '*';
          to: 'couriers';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      call_expire_orders: { Args: Record<PropertyKey, never>; Returns: undefined };
      call_internal_function: { Args: { p_body: Json; p_name: string }; Returns: undefined };
      cancel_unclaimed_delivery: {
        Args: { p_order_id: string };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      courier_accept_mission: {
        Args: { p_order_id: string };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      courier_confirm_delivery_payment: {
        Args: { p_order_id: string };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      courier_earnings_by_day: {
        Args: { p_days?: number };
        Returns: { card_cents: number; cash_cents: number; day: string; runs_count: number }[];
      };
      courier_earnings_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          month_cents: number;
          month_count: number;
          today_cents: number;
          today_count: number;
          week_cents: number;
        }[];
      };
      courier_mark_delivered: {
        Args: { p_delivery_code: string; p_order_id: string };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      courier_rating_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          average: number | null;
          reviews_count: number;
          stars_1: number;
          stars_2: number;
          stars_3: number;
          stars_4: number;
          stars_5: number;
        }[];
      };
      create_courier: {
        Args: {
          p_display_name: string;
          p_legal_status: Database['public']['Enums']['courier_legal_status'];
          p_phone: string;
          p_siret: string;
          p_vehicle: Database['public']['Enums']['courier_vehicle'];
        };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          is_available: boolean;
          last_assigned_at: string | null;
          legal_status: Database['public']['Enums']['courier_legal_status'];
          phone: string;
          siret: string;
          updated_at: string;
          user_id: string;
          vehicle: Database['public']['Enums']['courier_vehicle'];
          work_zone: string | null;
          photo_url: string | null;
          payment_link: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'couriers';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_merchant: {
        Args: {
          p_address_line: string;
          p_category: string;
          p_city: string;
          p_default_prep_minutes?: number;
          p_description?: string;
          p_latitude: number;
          p_longitude: number;
          p_name: string;
          p_phone?: string;
          p_postal_code: string;
        };
        Returns: {
          address_line: string;
          category: string;
          city: string;
          created_at: string;
          default_prep_minutes: number;
          delivery_enabled: boolean;
          delivery_fee_cents: number;
          delivery_radius_m: number;
          accepts_cash_pickup: boolean;
          description: string | null;
          id: string;
          is_paused: boolean;
          is_published: boolean;
          latitude: number;
          location: unknown;
          longitude: number;
          name: string;
          owner_id: string;
          paused_until: string | null;
          phone: string | null;
          postal_code: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchants';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_order: {
        Args: {
          p_customer_id: string;
          p_customer_note?: string;
          p_delivery?: Json;
          p_delivery_payment?: Database['public']['Enums']['payment_method'];
          p_items: Json;
          p_meal_payment?: Database['public']['Enums']['payment_method'];
          p_merchant_id: string;
        };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_courier_id: { Args: Record<PropertyKey, never>; Returns: string };
      customer_declare_payment: {
        Args: { p_kind: string; p_order_id: string };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      decide_courier_link: {
        Args: { p_approve: boolean; p_courier_id: string };
        Returns: {
          courier_id: string;
          decided_at: string | null;
          merchant_id: string;
          requested_at: string;
          status: Database['public']['Enums']['courier_link_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'merchant_couriers';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_closure: {
        Args: { p_from: string; p_merchant_id: string; p_reason?: string; p_to: string };
        Returns: Database['public']['Tables']['merchant_closures']['Row'];
      };
      active_happy_hours: {
        Args: { p_at?: string; p_merchant_id: string; p_mode: string };
        Returns: {
          ends_at: string;
          happy_hour_id: string;
          item_id: string;
          name: string;
          promo_cents: number;
          quantity_remaining: number | null;
          regular_cents: number;
        }[];
      };
      has_happy_hour_now: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      has_minisite: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      save_happy_hour: {
        Args: { p_data: Json; p_id: string | null; p_merchant_id: string };
        Returns: Database['public']['Tables']['happy_hours']['Row'];
      };
      set_happy_hour_active: {
        Args: { p_active: boolean; p_id: string };
        Returns: Database['public']['Tables']['happy_hours']['Row'];
      };
      delete_happy_hour: { Args: { p_id: string }; Returns: undefined };
      is_reservable: {
        Args: {
          b: Omit<
            Database['public']['Tables']['surprise_baskets']['Row'],
            Database['public']['Tables']['surprise_baskets']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      save_basket: {
        Args: { p_data: Json; p_id: string | null; p_merchant_id: string };
        Returns: Database['public']['Tables']['surprise_baskets']['Row'];
      };
      set_basket_active: {
        Args: { p_active: boolean; p_id: string };
        Returns: Database['public']['Tables']['surprise_baskets']['Row'];
      };
      reserve_basket: {
        Args: { p_basket_id: string; p_quantity?: number };
        Returns: Database['public']['Tables']['basket_reservations']['Row'];
      };
      cancel_basket_reservation: {
        Args: { p_id: string };
        Returns: Database['public']['Tables']['basket_reservations']['Row'];
      };
      collect_basket_reservation: {
        Args: { p_code: string; p_id: string };
        Returns: Database['public']['Tables']['basket_reservations']['Row'];
      };
      is_in_slot: {
        Args: { p_at?: string; p_item_id: string };
        Returns: boolean;
      };
      is_in_slot_now: {
        Args: {
          i: Omit<
            Database['public']['Tables']['menu_items']['Row'],
            Database['public']['Tables']['menu_items']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      set_item_slots: {
        Args: { p_item_id: string; p_slots: Json };
        Returns: Database['public']['Tables']['menu_item_slots']['Row'][];
      };
      is_online: {
        Args: {
          c: Omit<
            Database['public']['Tables']['couriers']['Row'],
            Database['public']['Tables']['couriers']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      courier_heartbeat: { Args: Record<PropertyKey, never>; Returns: string | null };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      dev_place_test_order: { Args: { p_slug?: string }; Returns: string };
      expire_stale_orders: {
        Args: { p_pending_minutes?: number; p_placed_minutes?: number };
        Returns: {
          courier_stripe_account_id: string;
          delivery_checkout_session_id: string;
          delivery_payment_intent_id: string;
          order_id: string;
          stripe_account_id: string;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string;
        }[];
      };
      generate_pickup_code: { Args: Record<PropertyKey, never>; Returns: string };
      is_accepting_orders: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      is_courier_active: { Args: { p_courier_id: string }; Returns: boolean };
      is_courier_busy: { Args: { p_courier_id: string }; Returns: boolean };
      is_merchant_open: { Args: { p_at?: string; p_merchant_id: string }; Returns: boolean };
      is_merchant_owner: { Args: { p_merchant_id: string }; Returns: boolean };
      is_open_now: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      is_paused_now: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      is_payments_ready: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      has_delivery_option: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      has_order_mode: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      delivery_available_now: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      offers_delivery: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      is_pro_verified: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_subscription_active: {
        Args: {
          m: Omit<
            Database['public']['Tables']['merchants']['Row'],
            Database['public']['Tables']['merchants']['ComputedFields']
          >;
        };
        Returns: boolean;
      };
      is_valid_siret: { Args: { p_siret: string }; Returns: boolean };
      leave_merchant: { Args: { p_merchant_id: string }; Returns: undefined };
      mark_delivery_authorized: {
        Args: { p_order_id: string; p_payment_intent_id: string };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_order_authorized: {
        Args: { p_order_id: string; p_payment_intent_id: string };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_order_payment_failed: {
        Args: { p_order_id: string };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      merchant_confirm_payment: {
        Args: { p_order_id: string };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      merchant_delivery_quote: {
        Args: { p_latitude: number; p_longitude: number; p_merchant_id: string };
        Returns: {
          available: boolean;
          distance_m: number;
          fee_cents: number;
          reason: string;
        }[];
      };
      merchant_ratings: {
        Args: { p_merchant_ids: string[] };
        Returns: { average: number; merchant_id: string; reviews_count: number }[];
      };
      merchant_sales_by_day: {
        Args: { p_days?: number; p_merchant_id: string };
        Returns: { day: string; orders_count: number; revenue_cents: number }[];
      };
      merchant_today_summary: {
        Args: { p_merchant_id: string };
        Returns: {
          orders_count: number;
          pending_count: number;
          revenue_cents: number;
        }[];
      };
      merchant_top_items: {
        Args: { p_days?: number; p_merchant_id: string };
        Returns: { name: string; quantity: number; revenue_cents: number }[];
      };
      nearby_merchants: {
        Args: { p_latitude: number; p_limit?: number; p_longitude: number; p_radius_m?: number };
        Returns: {
          address_line: string | null;
          category: string;
          city: string;
          delivery_available_now: boolean;
          distance_m: number | null;
          has_happy_hour_now: boolean;
          id: string;
          is_accepting_orders: boolean;
          is_open: boolean;
          latitude: number | null;
          longitude: number | null;
          meal_periods: string[];
          name: string;
          offers_delivery: boolean;
          offers_pickup: boolean;
          slug: string;
        }[];
      };
      order_courier_profile: {
        Args: { p_order_id: string };
        Returns: {
          average: number | null;
          display_name: string;
          payment_link: string | null;
          photo_url: string | null;
          reviews_count: number;
          vehicle: Database['public']['Enums']['courier_vehicle'];
        }[];
      };
      purge_delivery_details: { Args: { p_days?: number }; Returns: number };
      register_push_token: { Args: { p_platform: string; p_token: string }; Returns: undefined };
      remove_courier: { Args: { p_courier_id: string }; Returns: undefined };
      request_merchant_link: {
        Args: { p_merchant_id: string };
        Returns: {
          courier_id: string;
          decided_at: string | null;
          merchant_id: string;
          requested_at: string;
          status: Database['public']['Enums']['courier_link_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'merchant_couriers';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      search_merchants: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          address_line: string | null;
          category: string;
          city: string;
          delivery_available_now: boolean;
          distance_m: number | null;
          has_happy_hour_now: boolean;
          id: string;
          is_accepting_orders: boolean;
          is_open: boolean;
          latitude: number | null;
          longitude: number | null;
          meal_periods: string[];
          name: string;
          offers_delivery: boolean;
          offers_pickup: boolean;
          slug: string;
        }[];
      };
      set_courier_availability: {
        Args: { p_available: boolean };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          is_available: boolean;
          last_assigned_at: string | null;
          legal_status: Database['public']['Enums']['courier_legal_status'];
          phone: string;
          siret: string;
          updated_at: string;
          user_id: string;
          vehicle: Database['public']['Enums']['courier_vehicle'];
          work_zone: string | null;
          photo_url: string | null;
          payment_link: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'couriers';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_customer_departure: {
        Args: {
          p_customer_id: string;
          p_mode: Database['public']['Enums']['travel_mode'];
          p_order_id: string;
          p_travel_seconds: number;
        };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_default_address: { Args: { p_address_id: string }; Returns: undefined };
      set_opening_hours: {
        Args: { p_merchant_id: string; p_slots: Json };
        Returns: {
          closes_at: string;
          id: string;
          merchant_id: string;
          opens_at: string;
          weekday: number;
        }[];
        SetofOptions: {
          from: '*';
          to: 'merchant_opening_hours';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      set_order_status: {
        Args: {
          p_order_id: string;
          p_pickup_code?: string;
          p_prep_minutes?: number;
          p_refusal_reason?: string;
          p_status: Database['public']['Enums']['order_status'];
        };
        Returns: {
          delivery_payment_declared_at: string | null;
          meal_payment_declared_at: string | null;
          accepted_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          collected_at: string | null;
          courier_accepted_at: string | null;
          courier_id: string | null;
          courier_name: string | null;
          courier_stripe_account_id: string | null;
          created_at: string;
          currency: string;
          customer_departed_at: string | null;
          customer_eta_at: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_note: string | null;
          customer_travel_mode: Database['public']['Enums']['travel_mode'] | null;
          delivered_at: string | null;
          delivery_address_line: string | null;
          delivery_authorized_at: string | null;
          delivery_checkout_session_id: string | null;
          delivery_city: string | null;
          delivery_code: string | null;
          delivery_distance_m: number | null;
          delivery_fee_cents: number;
          delivery_instructions: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_paid_at: string | null;
          delivery_payment_due_at: string | null;
          delivery_payment_method: Database['public']['Enums']['payment_method'];
          meal_payment_method: Database['public']['Enums']['payment_method'];
          delivery_payment_intent_id: string | null;
          delivery_phone: string | null;
          delivery_postal_code: string | null;
          discount_cents: number;
          estimated_ready_at: string | null;
          fulfillment: Database['public']['Enums']['fulfillment_type'];
          id: string;
          is_loyalty_reward: boolean;
          loyalty_counted: boolean;
          meal_authorized_at: string | null;
          merchant_id: string;
          out_for_delivery_at: string | null;
          paid_at: string | null;
          pickup_code: string;
          placed_at: string | null;
          prep_minutes: number | null;
          ready_at: string | null;
          refusal_reason: string | null;
          status: Database['public']['Enums']['order_status'];
          stripe_account_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_order_review: {
        Args: {
          p_comment?: string;
          p_courier_stars?: number;
          p_merchant_stars?: number;
          p_order_id: string;
        };
        Returns: {
          comment: string | null;
          courier_id: string | null;
          courier_stars: number | null;
          created_at: string;
          customer_id: string | null;
          merchant_id: string;
          merchant_stars: number | null;
          order_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'order_reviews';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      courier_legal_status: 'auto_entrepreneur' | 'societe';
      courier_link_status: 'pending' | 'approved' | 'rejected';
      courier_vehicle: 'bike' | 'scooter' | 'car' | 'foot';
      fulfillment_type: 'pickup' | 'delivery';
      payment_method: 'card' | 'cash';
      order_status:
        | 'pending_payment'
        | 'placed'
        | 'accepted'
        | 'preparing'
        | 'ready'
        | 'out_for_delivery'
        | 'delivered'
        | 'collected'
        | 'refused'
        | 'expired'
        | 'cancelled';
      subscription_status:
        | 'incomplete'
        | 'incomplete_expired'
        | 'trialing'
        | 'active'
        | 'past_due'
        | 'canceled'
        | 'unpaid'
        | 'paused';
      travel_mode: 'walk' | 'bike' | 'drive';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      courier_legal_status: ['auto_entrepreneur', 'societe'],
      courier_link_status: ['pending', 'approved', 'rejected'],
      courier_vehicle: ['bike', 'scooter', 'car', 'foot'],
      fulfillment_type: ['pickup', 'delivery'],
      payment_method: ['card', 'cash'],
      order_status: [
        'pending_payment',
        'placed',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
        'delivered',
        'collected',
        'refused',
        'expired',
        'cancelled',
      ],
      subscription_status: [
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
      ],
      travel_mode: ['walk', 'bike', 'drive'],
    },
  },
} as const;
