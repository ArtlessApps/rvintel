import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min — needed for 16 Firecrawl calls per market
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ─── Market / class config ────────────────────────────────────────────────────
// One entry per platform+class combination. Firecrawl stealth proxy bypasses
// Outdoorsy's 403 bot-block; RVshare filters are client-side JS so Firecrawl's
// headless browser applies them after the 4s waitFor.

type ScrapeTarget = { platform: "outdoorsy" | "rvshare"; url: string };

const MARKET_TARGETS: Record<string, ScrapeTarget[]> = {
  "san-diego-ca": [
    // Outdoorsy — filter[vehicle_type] values confirmed from their URL scheme
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=a-class" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=b-van" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=c-class" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=travel-trailer" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=fifth-wheel" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=toy-hauler" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=pop-up" },
    { platform: "outdoorsy", url: "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&filter[vehicle_type]=truck-camper" },
    // RVshare — type param is read by React Router on load; Firecrawl runs the JS
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-a" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-b" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-c" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=travel-trailer" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=fifth-wheel" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=toy-hauler" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=pop-up" },
    { platform: "rvshare", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=truck-camper" },
  ],
};

// ─── Extraction schema ────────────────────────────────────────────────────────

const RV_CLASSES = [
  "Class A",
  "Class B",
  "Class C",
  "Travel Trailer",
  "Fifth Wheel",
  "Toy Hauler",
  "Pop Up",
  "Truck Camper",
  "Not an RV",
  "Other",
] as const;

type RvClass = (typeof RV_CLASSES)[number];

const ListingExtractSchema = z.object({
  listings: z.array(
    z.object({
      listing_url: z.string().describe("Full URL to the individual listing page"),
      host_name: z.string().optional().describe("Name of the host or rental company"),
      rv_class: z.enum(RV_CLASSES).describe(
        "Classify strictly by body style, not size or brand. " +
        "Class A = large bus/coach-style motorhome (flat front, huge windshield; Tiffin, Newmar, Fleetwood Bounder, Winnebago Vista). " +
        "Class B = van-based campervan with NO over-cab bed; the van roofline is continuous (Winnebago Travato/Solis/Revel, Airstream Interstate, Coachmen Galleria, Storyteller Overland, Mercedes Sprinter / Ford Transit / Ram Promaster conversions). " +
        "Class C = motorhome built on a cut-away van/truck chassis WITH a distinctive bed or storage cabover that hangs over the driver cab (Winnebago Minnie Winnie/View/Navion, Thor Four Winds/Chateau, Jayco Redhawk/Greyhawk, Coachmen Leprechaun). " +
        "Travel Trailer = towable, bumper pull, no motor. " +
        "Fifth Wheel = towable with a raised kingpin hitch that sits in a pickup bed. " +
        "Toy Hauler = trailer or motorhome with a rear ramp door/garage. " +
        "Pop Up = folding tent trailer. " +
        "Truck Camper = slide-in camper that sits in a pickup truck bed (Lance, Northern Lite, Four Wheel Campers, Palomino); the pickup cab is visible below the camper. " +
        "Not an RV = a bare pickup truck, SUV, car, sedan, or any tow vehicle with no camper body. If you only see a pickup truck with no camper mounted, return 'Not an RV'. " +
        "Other = anything that truly does not fit. Prefer a specific class over Other whenever possible."
      ),
      rv_title: z.string().optional().describe(
        "The full raw title/headline shown on the listing card, verbatim. " +
        "Example: '2019 Four Winds 26B' or 'FRANCES 2019 Thor Four Winds 26B'. " +
        "Include the complete text exactly as it appears — do not abbreviate or reword."
      ),
      rv_year: z.number().int().optional().describe("Model year of the RV"),
      rv_make: z.string().optional().describe(
        "Brand/series name as shown, e.g. 'Four Winds', 'Travato', 'Minnie Winnie'. " +
        "Prefer the RV series over the underlying chassis manufacturer. " +
        "If the listing says 'Thor Four Winds', rv_make is 'Four Winds' (not 'Thor')."
      ),
      rv_model: z.string().optional().describe("Model/floorplan code, e.g. '26B', '59K', '22A'"),
      nightly_rate: z.number().describe("Nightly rental rate in USD (number only)"),
      weekly_rate: z.number().optional().describe("Weekly rental rate in USD if shown"),
      review_count: z.number().int().optional().describe("Total number of reviews"),
      avg_rating: z.number().optional().describe("Average star rating out of 5"),
      amenities: z.array(z.string()).optional().describe("List of amenities shown on the card"),
    })
  ),
});

// ─── Deterministic make/model → class lookup ─────────────────────────────────
// Applied AFTER the LLM classifies. Beats vision guesses for the common fleet.

const MAKE_MODEL_CLASS_RULES: { match: RegExp; class: RvClass }[] = [
  // Class B — van conversions
  { match: /\b(travato|solis|revel|ekko\s*22|era|boldt)\b/i, class: "Class B" },
  { match: /\b(airstream\s+interstate|interstate\s+(ext|nineteen|lounge|grand))\b/i, class: "Class B" },
  { match: /\b(galleria|beyond)\b/i, class: "Class B" }, // Coachmen
  { match: /\b(storyteller|mode\s*lt|stealth\s*mode)\b/i, class: "Class B" },
  { match: /\b(thor\s+(sequence|tellaro|rize|scope|sanctuary)|tellaro|rize\s*\d)\b/i, class: "Class B" },
  { match: /\b(sportsmobile|advanced\s*rv|outside\s*van|texino|vanlife\s*customs)\b/i, class: "Class B" },
  { match: /\b((mercedes[-\s]*)?sprinter|(ford\s+)?transit|(ram\s+)?promaster|metris)\s+(camper|conversion|van)\b/i, class: "Class B" },
  // Class C — cab-over motorhomes
  { match: /\b(minnie\s*winnie|winnebago\s+view|navion|winnebago\s+(spirit|outlook|porto))\b/i, class: "Class C" },
  { match: /\b(four\s*winds|chateau|freedom\s*elite|quantum|axis|vegas)\b/i, class: "Class C" }, // Thor
  { match: /\b(redhawk|greyhawk|melbourne|seneca)\b/i, class: "Class C" }, // Jayco
  { match: /\b(leprechaun|cross\s*trek|freelander|prism)\b/i, class: "Class C" }, // Coachmen
  { match: /\b(sunseeker|forester|isata)\b/i, class: "Class C" }, // Forest River / Dynamax
  // Class A
  { match: /\b(tiffin|allegro|phaeton|zephyr|bus|newmar|dutch\s*star|mountain\s*aire|ventana|bay\s*star)\b/i, class: "Class A" },
  { match: /\b(winnebago\s+(vista|adventurer|sunstar|journey|tour|forza)|bounder|discovery|fleetwood\s+(bounder|pace|southwind))\b/i, class: "Class A" },
  { match: /\b(georgetown|pace\s*arrow|challenger|hurricane|palazzo)\b/i, class: "Class A" },
  // Travel Trailer
  { match: /\b(airstream\s+(bambi|basecamp|caravel|flying\s*cloud|globetrotter|international|classic))\b/i, class: "Travel Trailer" },
  { match: /\b(r[-\s]*pod|rockwood|flagstaff|jayflight|jay\s*flight|keystone\s+(bullet|hideout|passport|springdale))\b/i, class: "Travel Trailer" },
  { match: /\b(imagine|reflection|transcend|kodiak|wolf\s*pup|no[-\s]*boundaries|nobo)\b/i, class: "Travel Trailer" },
  { match: /\b(taxa|cricket|mantis|woolly\s*bear|tigermoth|happier\s*camper|casita|scamp|oliver)\b/i, class: "Travel Trailer" },
  // Fifth Wheel
  { match: /\b(fifth[-\s]*wheel|5th[-\s]*wheel|montana|cougar|cardinal|big\s*country|sabre|cedar\s*creek|reflection\s*\d{3}rl)\b/i, class: "Fifth Wheel" },
  // Toy Hauler
  { match: /\b(toy\s*hauler|fuzion|momentum|raptor|cyclone|stryker|outlaw)\b/i, class: "Toy Hauler" },
  // Truck Camper
  { match: /\b(truck\s*camper|lance\s*\d{3,4}|northern\s*lite|four\s*wheel\s*camper|palomino\s+(ss|backpack|real[-\s]*lite)|arctic\s*fox\s*camper|bigfoot\s*camper)\b/i, class: "Truck Camper" },
  // Pop Up
  { match: /\b(pop[-\s]*up|tent\s*trailer|a[-\s]*frame|aliner|clipper\s*classic|rockwood\s*(freedom|hw)|jay\s*sport)\b/i, class: "Pop Up" },
];

function classifyFromText(haystack: string): RvClass | null {
  for (const rule of MAKE_MODEL_CLASS_RULES) {
    if (rule.match.test(haystack)) return rule.class;
  }
  return null;
}

function finalClass(
  llmClass: RvClass | undefined,
  title: string | undefined | null,
  make: string | undefined | null,
  model: string | undefined | null,
  listingUrl: string
): RvClass {
  const slug = (() => {
    try {
      return new URL(listingUrl).pathname.toLowerCase();
    } catch {
      return listingUrl.toLowerCase();
    }
  })();

  // Combine every text signal the LLM gave us so a brand name lands a match
  // even if it gets swapped between make/model/title fields.
  const haystack = [title ?? "", make ?? "", model ?? "", slug].join(" ");

  // Deterministic lookup wins over the LLM for known make/models.
  const fromTable = classifyFromText(haystack);
  if (fromTable) return fromTable;

  // Otherwise trust the LLM's classification if it's one of the enum values.
  if (llmClass && (RV_CLASSES as readonly string[]).includes(llmClass)) return llmClass;

  return "Other";
}

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
  platformFilter?: "outdoorsy" | "rvshare"
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const allTargets = MARKET_TARGETS[market];
  if (!allTargets) throw new Error(`Unknown market: ${market}`);
  const targets = platformFilter ? allTargets.filter(t => t.platform === platformFilter) : allTargets;

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  const scrapeOne = async ({ platform, url }: ScrapeTarget): Promise<{ inserted: number; skipped: number; errors: string[] }> => {
    const label = `${platform} ${new URL(url).searchParams.get("filter[vehicle_type]") ?? new URL(url).searchParams.get("type") ?? "all"}`;
    const localErrors: string[] = [];
    let localInserted = 0;
    let localSkipped = 0;

    try {
    const result = await firecrawl.scrape(url, {
        formats: [
          "markdown",
          {
            type: "json",
            schema: ListingExtractSchema,
            prompt:
              "Extract every RV rental listing visible on the page. For each listing return: listing_url, host_name, rv_title (verbatim), rv_year, rv_make, rv_model, nightly_rate, weekly_rate, review_count, avg_rating, amenities, and rv_class.\n\n" +
              "ALWAYS include rv_title copied word-for-word from the listing card headline (e.g. '2019 Four Winds 26B'). This is required — do not skip it.\n\n" +
              "CRITICAL — model/floorplan codes are NOT class designators:\n" +
              "A trailing letter like A, B, C, E, F, G, J, K, M after a number is a FLOORPLAN code, not an RV class. '26B', '22E', '30A', '24F', '59K' say nothing about class. IGNORE those letters when classifying. Classify only from the body style (photo) and the brand/series name.\n\n" +
              "CLASSIFICATION RULES — be precise. Decide rv_class from the photo and the brand/series:\n" +
              "- Class A: large bus-style coach with flat front and huge windshield. Examples: Tiffin Allegro, Newmar Dutch Star, Fleetwood Bounder, Winnebago Vista/Adventurer, Thor Hurricane.\n" +
              "- Class B: van-sized campervan with a CONTINUOUS van roofline and NO bed hanging over the cab. Examples: Winnebago Travato/Solis/Revel/Ekko 22, Airstream Interstate, Coachmen Galleria, Storyteller Overland, Thor Sequence/Tellaro, any Mercedes Sprinter / Ford Transit / Ram Promaster conversion.\n" +
              "- Class C: motorhome on a cut-away van/truck chassis with a VERY DISTINCTIVE bed or storage bump that juts out OVER the driver cab. Examples: Winnebago Minnie Winnie/View/Navion, Thor Four Winds/Chateau/Quantum/Freedom Elite, Jayco Redhawk/Greyhawk/Melbourne, Coachmen Leprechaun/Freelander, Forest River Sunseeker/Forester.\n" +
              "- Travel Trailer: towable, no motor, bumper-pull hitch. Examples: Airstream Bambi/Flying Cloud, Jayco Jay Flight, Grand Design Imagine, R-Pod, Happier Camper, Taxa.\n" +
              "- Fifth Wheel: towable with a raised kingpin/gooseneck that sits in a pickup bed.\n" +
              "- Toy Hauler: trailer or motorhome with a rear ramp door garage.\n" +
              "- Pop Up: folding tent trailer.\n" +
              "- Truck Camper: a slide-in camper unit that sits INSIDE a pickup truck bed; you can see the pickup's cab in front of and below the camper. Examples: Lance, Northern Lite, Four Wheel Campers, Palomino Backpack.\n" +
              "- Not an RV: a bare pickup truck, SUV, car, sedan, van with no camper interior, or any tow vehicle by itself. If the photo just shows a pickup truck with no camper mounted, you MUST return 'Not an RV'. Do NOT label pickup trucks as Class C.\n" +
              "- Other: only if nothing above fits.\n\n" +
              "Brand-name cheat sheet (use these as authoritative — any listing whose title contains these words is that class regardless of model code):\n" +
              "Class B: Travato, Solis, Revel, Ekko, Boldt, Airstream Interstate, Galleria, Beyond, Storyteller, Sequence, Tellaro, Rize, Scope, Sanctuary.\n" +
              "Class C: Four Winds, Chateau, Freedom Elite, Quantum, Axis, Vegas, Minnie Winnie, View, Navion, Spirit, Outlook, Porto, Redhawk, Greyhawk, Melbourne, Seneca, Leprechaun, Freelander, Prism, Sunseeker, Forester, Isata.\n" +
              "Class A: Tiffin, Allegro, Phaeton, Newmar, Dutch Star, Mountain Aire, Ventana, Bay Star, Bounder, Pace Arrow, Hurricane, Palazzo, Georgetown, Discovery, Vista, Adventurer, Journey, Tour, Forza.\n\n" +
              "For rv_make, prefer the RV series/brand name (e.g. 'Four Winds', 'Travato') over the chassis manufacturer (e.g. 'Thor', 'Mercedes'). If the title is 'Thor Four Winds 26B', rv_make = 'Four Winds', rv_model = '26B'.\n\n" +
              "Common mistakes to AVOID:\n" +
              "1. NEVER let a trailing letter in a model code (22B, 26B, 30A) drive the class. The letter is a floorplan designator.\n" +
              "2. A 'Four Winds' is ALWAYS Class C — it has a cab-over bed. Never Class B.\n" +
              "3. Do NOT put Class C motorhomes (with an over-cab bed) into Class B. Class B NEVER has an over-cab bump.\n" +
              "4. Do NOT put a pickup truck into Class C. A Class C always has a large motorhome body behind the cab; a bare pickup truck has just a cargo bed.\n" +
              "5. A Sprinter/Transit/Promaster is Class B ONLY if it has the van's original roofline. If it has a boxy motorhome body bolted on with a cab-over, it's Class C.\n" +
              "6. 'Lance', 'Northern Lite', 'Four Wheel Camper' is a Truck Camper, not Class C.",
          },
        ],
        waitFor: 1500,
        proxy: "stealth",
      } as Parameters<typeof firecrawl.scrape>[1]);

      const raw = result as Record<string, unknown>;
      const statusCode = (raw.metadata as Record<string, unknown>)?.statusCode as number | undefined;

      // Use json data if present, regardless of success flag (Firecrawl can return
      // success:false on 403/bot-blocked pages while still having extracted content)
      const jsonData = raw.json as z.infer<typeof ListingExtractSchema> | undefined;

      if (!jsonData?.listings?.length) {
        const md = (raw.markdown as string | undefined)?.slice(0, 400) ?? "(no markdown)";
        localErrors.push(`${label}: no listings extracted (status ${statusCode ?? "?"}). Preview: ${md}`);
        return { inserted: 0, skipped: 0, errors: localErrors };
      }

      const { listings } = jsonData;

      const rows = listings
        .filter((l) => l.nightly_rate > 0)
        .map((l) => {
          const resolvedClass = finalClass(
            l.rv_class as RvClass | undefined,
            l.rv_title,
            l.rv_make,
            l.rv_model,
            l.listing_url
          );
          return {
            platform,
            market,
            rv_class: resolvedClass,
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
          };
        })
        .filter((row) => {
          if (row.rv_class === "Not an RV") { localSkipped++; return false; }
          return true;
        });

      const { error } = await supabase
        .from("listings")
        .upsert(rows, { onConflict: "listing_url", ignoreDuplicates: false });

      if (error) {
        localErrors.push(`${label} upsert: ${error.message}`);
      } else {
        localInserted = rows.length;
      }
    } catch (err) {
      localErrors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { inserted: localInserted, skipped: localSkipped, errors: localErrors };
  };

  // Run in batches of 3 to stay within Firecrawl's per-key concurrency limit
  const BATCH_SIZE = 3;
  const allResults: PromiseSettledResult<{ inserted: number; skipped: number; errors: string[] }>[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(scrapeOne));
    allResults.push(...batchResults);
  }
  const results = allResults;

  for (const r of results) {
    if (r.status === "fulfilled") {
      inserted += r.value.inserted;
      skipped += r.value.skipped;
      errors.push(...r.value.errors);
    } else {
      errors.push(`target failed: ${r.reason}`);
    }
  }

  return { inserted, skipped, errors };
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
  const platformFilter = body.platform as "outdoorsy" | "rvshare" | undefined;

  const firecrawl = new FirecrawlApp({ apiKey });

  try {
    const { inserted, skipped, errors } = await scrapeMarket(firecrawl, market, platformFilter);

    return NextResponse.json({
      success: true,
      market,
      inserted,
      skipped,
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
  // Vercel Cron calls GET — pass platform from query param if present
  const platform = new URL(req.url).searchParams.get("platform") ?? undefined;
  const body = JSON.stringify({ market: "san-diego-ca", ...(platform ? { platform } : {}) });
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body }) as NextRequest);
}
