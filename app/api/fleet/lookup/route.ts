import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

type ListingRow = {
  id: string;
  listing_url: string;
  rv_year: number | null;
  rv_make: string | null;
  rv_model: string | null;
  rv_class: string;
  nightly_rate: number;
  primary_image_url: string | null;
  location_city: string | null;
  location_state: string | null;
  sleeps: number | null;
  length_ft: number | null;
  delivery: boolean | null;
  instant_book: boolean | null;
  market: string;
  scraped_at: string;
};

type SnapRow = {
  price_median: number;
  captured_at: string;
};

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return raw.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw: string | undefined = body?.url;
  const sessionId: string | undefined = body?.session_id;

  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const url = normalizeUrl(raw);
  const supabase = getServiceSupabase();

  const { data, error: listingErr } = await supabase
    .from("listings")
    .select(
      "id, listing_url, rv_year, rv_make, rv_model, rv_class, nightly_rate, " +
      "primary_image_url, location_city, location_state, sleeps, length_ft, " +
      "delivery, instant_book, market, scraped_at"
    )
    .ilike("listing_url", url)
    .limit(1);

  if (listingErr) {
    return NextResponse.json({ error: listingErr.message }, { status: 500 });
  }

  const listingRows = data as unknown as ListingRow[] | null;

  if (!listingRows || listingRows.length === 0) {
    return NextResponse.json({
      found: false,
      message: "This listing isn't in our database yet. We may not cover this market.",
    });
  }

  const row = listingRows[0];
  const title =
    [row.rv_year, row.rv_make, row.rv_model].filter(Boolean).join(" ") ||
    "Unknown RV";

  const listing = {
    id: row.id,
    listing_url: row.listing_url,
    title,
    rv_class: row.rv_class,
    nightly_rate: row.nightly_rate,
    primary_image_url: row.primary_image_url,
    location_city: row.location_city,
    location_state: row.location_state,
    sleeps: row.sleeps,
    length_ft: row.length_ft,
    delivery: row.delivery,
    instant_book: row.instant_book,
    market: row.market,
    scraped_at: row.scraped_at,
  };

  // Outdoorsy has class-grain medians; RVshare does not.
  const { data: snapData } = await supabase
    .from("search_snapshots")
    .select("price_median, captured_at")
    .eq("platform", "outdoorsy")
    .eq("market", row.market)
    .eq("rv_class", row.rv_class)
    .not("price_median", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1);

  const snapRows = snapData as unknown as SnapRow[] | null;
  const snap = snapRows?.[0] ?? null;

  if (!snap || snap.price_median == null) {
    return NextResponse.json({ found: true, listing, comp: null });
  }

  const rawDelta =
    ((row.nightly_rate - snap.price_median) / snap.price_median) * 100;
  const delta_pct = Math.round(rawDelta * 10) / 10;
  const position_label =
    delta_pct < -5 ? "Below Market" : delta_pct > 5 ? "Above Market" : "At Market";

  const comp = {
    market_median: snap.price_median,
    sample_freshness: snap.captured_at,
    delta_pct,
    position_label,
  };

  // Save to user_fleet — best effort, don't fail the request.
  if (sessionId) {
    supabase
      .from("user_fleet")
      .upsert(
        { session_id: sessionId, listing_id: row.id, listing_url: raw },
        { onConflict: "session_id,listing_url", ignoreDuplicates: true }
      )
      .then(() => {});
  }

  return NextResponse.json({ found: true, listing, comp });
}
