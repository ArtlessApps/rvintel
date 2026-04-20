import { NextRequest, NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ─── Market / class config ────────────────────────────────────────────────────

const MARKET_URLS: Record<string, { outdoorsy: string; rvshare: string; label: string }> = {
  "san-diego-ca": {
    label: "san-diego-ca",
    outdoorsy:
      "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&type=rv-rental",
    rvshare:
      "https://rvshare.com/rv-rental?location=san+diego+ca",
  },
};

// ─── Extraction schema ────────────────────────────────────────────────────────

const ListingExtractSchema = z.object({
  listings: z.array(
    z.object({
      listing_url: z.string().describe("Full URL to the individual listing page"),
      host_name: z.string().optional().describe("Name of the host or rental company"),
      rv_class: z.enum(["Class A", "Class B", "Class C", "Travel Trailer", "Fifth Wheel", "Other"]).describe(
        "RV class. Class B = campervans/van conversions (Winnebago Travato, Airstream Interstate, Mercedes Sprinter conversions, etc). Class A = large bus-style motorhomes. Class C = mid-size motorhomes with over-cab bed. Travel Trailer = towable. Fifth Wheel = towable with kingpin hitch."
      ),
      rv_year: z.number().int().optional().describe("Model year of the RV"),
      rv_make: z.string().optional().describe("Manufacturer, e.g. Winnebago, Airstream"),
      rv_model: z.string().optional().describe("Model name, e.g. Travato 59K"),
      nightly_rate: z.number().describe("Nightly rental rate in USD (number only)"),
      weekly_rate: z.number().optional().describe("Weekly rental rate in USD if shown"),
      review_count: z.number().int().optional().describe("Total number of reviews"),
      avg_rating: z.number().optional().describe("Average star rating out of 5"),
      amenities: z.array(z.string()).optional().describe("List of amenities shown on the card"),
    })
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev: no secret set = open
  const header = req.headers.get("x-vercel-cron") ?? req.headers.get("authorization");
  return header === cronSecret || header === `Bearer ${cronSecret}`;
}

async function scrapeMarket(
  firecrawl: FirecrawlApp,
  market: string,
  rvClass: string
): Promise<{ inserted: number; errors: string[] }> {
  const urls = MARKET_URLS[market];
  if (!urls) throw new Error(`Unknown market: ${market}`);

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let inserted = 0;

  for (const [platform, url] of [
    ["outdoorsy", urls.outdoorsy],
    ["rvshare", urls.rvshare],
  ] as const) {
    try {
      const result = await firecrawl.scrape(url, {
        formats: [
          "markdown",
          {
            type: "json",
            schema: ListingExtractSchema,
            prompt: "Extract all RV rental listings visible on the page. For each listing include the URL, host name, RV year/make/model, nightly rate, weekly rate, review count, average rating, and amenities.",
          },
        ],
        waitFor: 4000,
        proxy: "stealth",
      } as Parameters<typeof firecrawl.scrape>[1]);

      const raw = result as Record<string, unknown>;
      const statusCode = (raw.metadata as Record<string, unknown>)?.statusCode as number | undefined;

      // Use json data if present, regardless of success flag (Firecrawl can return
      // success:false on 403/bot-blocked pages while still having extracted content)
      const jsonData = raw.json as z.infer<typeof ListingExtractSchema> | undefined;

      if (!jsonData?.listings?.length) {
        const md = (raw.markdown as string | undefined)?.slice(0, 400) ?? "(no markdown)";
        errors.push(`${platform}: no listings extracted (status ${statusCode ?? "?"}). Preview: ${md}`);
        continue;
      }

      const { listings } = jsonData;

      if (!listings?.length) {
        errors.push(`${platform}: 0 listings extracted`);
        continue;
      }

      const rows = listings
        .filter((l) => l.nightly_rate > 0)
        .map((l) => ({
          platform,
          market,
          rv_class: l.rv_class ?? rvClass,
          listing_url: l.listing_url,
          host_name: l.host_name ?? null,
          rv_year: l.rv_year ?? null,
          rv_make: l.rv_make ?? null,
          rv_model: l.rv_model ?? null,
          nightly_rate: l.nightly_rate,
          weekly_rate: l.weekly_rate ?? null,
          review_count: l.review_count ?? null,
          avg_rating: l.avg_rating ?? null,
          amenities: l.amenities ?? [],
          scraped_at: new Date().toISOString(),
        }));

      // Upsert on listing_url — requires unique constraint (see SQL setup notes)
      const { error } = await supabase
        .from("listings")
        .upsert(rows, { onConflict: "listing_url", ignoreDuplicates: false });

      if (error) {
        errors.push(`${platform} upsert: ${error.message}`);
      } else {
        inserted += rows.length;
      }
    } catch (err) {
      errors.push(`${platform}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { inserted, errors };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FIRECRAWL_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const market = body.market ?? "san-diego-ca";
  const rvClass = body.rv_class ?? "Class B";

  const firecrawl = new FirecrawlApp({ apiKey });

  try {
    const { inserted, errors } = await scrapeMarket(firecrawl, market, rvClass);

    return NextResponse.json({
      success: true,
      market,
      rv_class: rvClass,
      inserted,
      errors: errors.length ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Vercel Cron calls GET — forward to POST logic
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body: "{}" }) as NextRequest);
}
