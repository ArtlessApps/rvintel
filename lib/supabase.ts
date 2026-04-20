import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars. See .env.local.example."
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

// Convenience export — only safe to call in browser or server with env vars set
export const supabase = {
  from: (table: string) => getSupabase().from(table),
};

export type Database = {
  public: {
    Tables: {
      listings: {
        Row: {
          id: string;
          created_at: string;
          platform: "outdoorsy" | "rvshare";
          market: string;
          host_name: string;
          listing_url: string;
          rv_class: string;
          rv_year: number;
          rv_make: string;
          rv_model: string;
          nightly_rate: number;
          weekly_rate: number | null;
          review_count: number;
          avg_rating: number;
          amenities: string[];
          scraped_at: string;
          first_seen_at: string;
          last_seen_at: string;
          is_active: boolean;
          enriched_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["listings"]["Row"],
          "id" | "created_at" | "first_seen_at" | "is_active" | "enriched_at"
        > & {
          first_seen_at?: string;
          is_active?: boolean;
          enriched_at?: string | null;
        };
      };
      listing_snapshots: {
        Row: {
          listing_id: string;
          captured_at: string;
          nightly_rate: number;
          weekly_rate: number | null;
          review_count: number | null;
          avg_rating: number | null;
        };
        Insert: {
          listing_id: string;
          captured_at?: string;
          nightly_rate: number;
          weekly_rate?: number | null;
          review_count?: number | null;
          avg_rating?: number | null;
        };
      };
      availability_snapshots: {
        Row: {
          id: string;
          created_at: string;
          listing_id: string;
          snapshot_date: string;
          available_dates: string[];
          blocked_dates: string[];
        };
        Insert: Omit<Database["public"]["Tables"]["availability_snapshots"]["Row"], "id" | "created_at">;
      };
      cron_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          duration_ms: number | null;
          market: string;
          platform: string | null;
          status: "success" | "partial" | "failure";
          listings_upserted: number;
          snapshots_inserted: number;
          skipped_not_rv: number;
          error_count: number;
          errors: string[] | null;
          error_message: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["cron_runs"]["Row"], "id" | "started_at"> & {
          started_at?: string;
        };
      };
      waitlist: {
        Row: {
          id: string;
          created_at: string;
          email: string;
          fleet_size: number | null;
          market: string | null;
          platform: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["waitlist"]["Row"], "id" | "created_at">;
      };
    };
  };
};
