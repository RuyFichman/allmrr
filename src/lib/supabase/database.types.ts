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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      business_models: {
        Row: {
          created_at: string
          criteria: string
          description: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          asking_price_cents: number
          created_at: string
          id: string
          includes: string | null
          reason: string | null
          startup_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
        }
        Insert: {
          asking_price_cents: number
          created_at?: string
          id?: string
          includes?: string | null
          reason?: string | null
          startup_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Update: {
          asking_price_cents?: number
          created_at?: string
          id?: string
          includes?: string | null
          reason?: string | null
          startup_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: true
            referencedRelation: "startup_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: true
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string
          website_url: string | null
          x_handle: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username: string
          website_url?: string | null
          x_handle?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string
          website_url?: string | null
          x_handle?: string | null
        }
        Relationships: []
      }
      revenue_connections: {
        Row: {
          created_at: string
          encrypted_credentials: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["revenue_provider"]
          startup_id: string
          status: Database["public"]["Enums"]["revenue_connection_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_credentials: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["revenue_provider"]
          startup_id: string
          status?: Database["public"]["Enums"]["revenue_connection_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_credentials?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["revenue_provider"]
          startup_id?: string
          status?: Database["public"]["Enums"]["revenue_connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_connections_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startup_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_connections_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_snapshots: {
        Row: {
          active_subscriptions: number
          created_at: string
          date: string
          mrr_cents: number
          revenue_total_cents: number
          startup_id: string
          updated_at: string
        }
        Insert: {
          active_subscriptions?: number
          created_at?: string
          date: string
          mrr_cents?: number
          revenue_total_cents?: number
          startup_id: string
          updated_at?: string
        }
        Update: {
          active_subscriptions?: number
          created_at?: string
          date?: string
          mrr_cents?: number
          revenue_total_cents?: number
          startup_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_snapshots_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startup_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_snapshots_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_founders: {
        Row: {
          created_at: string
          profile_id: string
          role: string
          startup_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          role?: string
          startup_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          role?: string
          startup_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_founders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_founders_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startup_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_founders_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          business_model_id: string
          created_at: string
          created_by: string | null
          declared_business_model_id: string
          description: string | null
          founded_on: string | null
          id: string
          is_verified: boolean
          logo_url: string | null
          model_review_status: Database["public"]["Enums"]["model_review_status"]
          name: string
          niche_id: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["startup_status"]
          tagline: string | null
          team_size: number
          updated_at: string
          website_url: string
          x_handle: string | null
        }
        Insert: {
          business_model_id: string
          created_at?: string
          created_by?: string | null
          declared_business_model_id: string
          description?: string | null
          founded_on?: string | null
          id?: string
          is_verified?: boolean
          logo_url?: string | null
          model_review_status?: Database["public"]["Enums"]["model_review_status"]
          name: string
          niche_id?: string | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["startup_status"]
          tagline?: string | null
          team_size?: number
          updated_at?: string
          website_url: string
          x_handle?: string | null
        }
        Update: {
          business_model_id?: string
          created_at?: string
          created_by?: string | null
          declared_business_model_id?: string
          description?: string | null
          founded_on?: string | null
          id?: string
          is_verified?: boolean
          logo_url?: string | null
          model_review_status?: Database["public"]["Enums"]["model_review_status"]
          name?: string
          niche_id?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["startup_status"]
          tagline?: string | null
          team_size?: number
          updated_at?: string
          website_url?: string
          x_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startups_business_model_id_fkey"
            columns: ["business_model_id"]
            isOneToOne: false
            referencedRelation: "business_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startups_declared_business_model_id_fkey"
            columns: ["declared_business_model_id"]
            isOneToOne: false
            referencedRelation: "business_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startups_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      startup_directory: {
        Row: {
          business_model_name: string | null
          business_model_slug: string | null
          created_at: string | null
          growth_30d_pct: number | null
          id: string | null
          is_verified: boolean | null
          logo_url: string | null
          mrr_cents: number | null
          name: string | null
          niche_name: string | null
          niche_slug: string | null
          published_at: string | null
          revenue_as_of: string | null
          revenue_total_cents: number | null
          slug: string | null
          tagline: string | null
          website_url: string | null
          x_handle: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      listing_status: "active" | "under_offer" | "sold" | "withdrawn"
      model_review_status: "pending" | "approved" | "overridden"
      revenue_connection_status: "active" | "error" | "revoked"
      revenue_provider:
        | "stripe"
        | "lemonsqueezy"
        | "polar"
        | "paddle"
        | "revenuecat"
        | "gumroad"
      startup_status: "draft" | "published" | "hidden"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      listing_status: ["active", "under_offer", "sold", "withdrawn"],
      model_review_status: ["pending", "approved", "overridden"],
      revenue_connection_status: ["active", "error", "revoked"],
      revenue_provider: [
        "stripe",
        "lemonsqueezy",
        "polar",
        "paddle",
        "revenuecat",
        "gumroad",
      ],
      startup_status: ["draft", "published", "hidden"],
    },
  },
} as const
