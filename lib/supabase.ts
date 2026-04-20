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
        };
        Insert: Omit<Database["public"]["Tables"]["listings"]["Row"], "id" | "created_at">;
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
