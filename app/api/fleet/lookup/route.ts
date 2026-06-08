import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFleetLimit, PLAN_CONFIG, type PlanKey } from "@/lib/subscription";

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
  discovery_source: string | null;
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

  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const url = normalizeUrl(raw);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const limit = getFleetLimit(profile?.subscription_tier ?? null);
  const supabaseAdmin = getServiceSupabase();

  const { count: existingForUrl } = await supabaseAdmin
    .from("user_fleet")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .ilike("listing_url", url);

  if ((existingForUrl ?? 0) === 0) {
    const { count } = await supabaseAdmin
      .from("user_fleet")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= limit) {
      const tier = profile?.subscription_tier ?? null;
      const planLabel =
        tier && tier in PLAN_CONFIG
          ? PLAN_CONFIG[tier as PlanKey].label
          : "current";
      return NextResponse.json(
        {
          error: "fleet_limit_reached",
          message: `Your ${planLabel} plan allows ${limit} RV${limit === 1 ? "" : "s"}. Upgrade to add more.`,
          limit,
          current: count,
        },
        { status: 403 }
      );
    }
  }

  const { data, error: listingErr } = await supabaseAdmin
    .from("listings")
    .select(
      "id, listing_url, rv_year, rv_make, rv_model, rv_class, nightly_rate, " +
      "primary_image_url, location_city, location_state, sleeps, length_ft, " +
      "delivery, instant_book, discovery_source, scraped_at"
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
    discovery_source: row.discovery_source,
    scraped_at: row.scraped_at,
  };

  // Outdoorsy has class-grain medians; RVshare does not.
  const { data: snapData } = await supabaseAdmin
    .from("search_snapshots")
    .select("price_median, captured_at")
    .eq("platform", "outdoorsy")
    .eq("market", row.discovery_source ?? "")
    .eq("rv_class", row.rv_class)
    .not("price_median", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1);

  const snapRows = snapData as unknown as SnapRow[] | null;
  const snap = snapRows?.[0] ?? null;

  let comp: {
    market_median: number;
    sample_freshness: string;
    delta_pct: number;
    position_label: string;
  } | null = null;

  if (snap && snap.price_median != null) {
    const rawDelta =
      ((row.nightly_rate - snap.price_median) / snap.price_median) * 100;
    const delta_pct = Math.round(rawDelta * 10) / 10;
    const position_label =
      delta_pct < -5 ? "Below Market" : delta_pct > 5 ? "Above Market" : "At Market";

    comp = {
      market_median: snap.price_median,
      sample_freshness: snap.captured_at,
      delta_pct,
      position_label,
    };
  }

  const { error: fleetErr } = await supabaseAdmin.from("user_fleet").upsert(
    {
      user_id: user.id,
      session_id: user.id,
      listing_id: row.id,
      listing_url: raw,
    },
    { onConflict: "user_id,listing_url", ignoreDuplicates: false }
  );

  if (fleetErr) {
    return NextResponse.json({ error: fleetErr.message }, { status: 500 });
  }

  return NextResponse.json({ found: true, listing, comp });
}
