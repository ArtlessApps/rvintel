import { NextRequest, NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

// ─── Market / class config ────────────────────────────────────────────────────

const MARKET_URLS: Record<string, { outdoorsy: string; rvshare: string; label: string }> = {
  "san-diego-ca": {
    label: "san-diego-ca",
    outdoorsy:
      "https://www.outdoorsy.com/rv-rental/san_diego/ca?type=b-van",
    rvshare:
      "https://rvshare.com/rv-rental/san-diego-ca?type[]=class-b",
  },
};

// ─── Extraction schema ────────────────────────────────────────────────────────

const ListingExtractSchema = z.object({
  listings: z.array(
    z.object({
      listing_url: z.string().describe("Full URL to the individual listing page"),
      host_name: z.string().optional().describe("Name of the host or rental company"),
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

  const supabase = getSupabase();
  const errors: string[] = [];
  let inserted = 0;

  for (const [platform, url] of [
    ["outdoorsy", urls.outdoorsy],
    ["rvshare", urls.rvshare],
  ] as const) {
    try {
      const result = await firecrawl.scrape(url, {
        formats: ["extract"],
        extract: { schema: ListingExtractSchema },
      });

      if (!result.success || !result.extract) {
        errors.push(`${platform}: extraction returned no data`);
        continue;
      }

      const { listings } = result.extract as z.infer<typeof ListingExtractSchema>;

      if (!listings?.length) {
        errors.push(`${platform}: 0 listings extracted`);
        continue;
      }

      const rows = listings
        .filter((l) => l.nightly_rate > 0)
        .map((l) => ({
          platform,
          market,
          rv_class: rvClass,
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
