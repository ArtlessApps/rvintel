import { liveMarkets, MARKET_BY_SLUG, type MarketDefinition } from "@/lib/markets";
import { getMarketMagnet, type MarketMagnet } from "@/lib/market-magnets";
import { isRoiRvClass, type RoiRvClass } from "@/lib/roi-defaults";

const MIN_CLASS_SAMPLE = 5;

export type ZipCoords = {
  zip: string;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
};

export type NearestMarketResult = {
  market: MarketDefinition;
  distanceMiles: number;
};

export type RoiMarketDefaults = {
  zip: string;
  city: string | null;
  state: string | null;
  marketSlug: string;
  marketName: string;
  distanceMiles: number;
  medianRate: number | null;
  rateSource: "class" | "market" | null;
  listingCount: number;
  classCount: number;
  asOf: string | null;
  rvClass: RoiRvClass | null;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function normalizeZip(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

/** Resolve US ZIP → lat/lng via Zippopotam.us (cached by Next fetch). */
export async function geocodeUsZip(zip: string): Promise<ZipCoords | null> {
  const normalized = normalizeZip(zip);
  if (!normalized) return null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${normalized}`, {
      next: { revalidate: 86400 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      "post code"?: string;
      places?: Array<{
        latitude?: string;
        longitude?: string;
        "place name"?: string;
        "state abbreviation"?: string;
      }>;
    };
    const place = data.places?.[0];
    if (!place?.latitude || !place?.longitude) return null;
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      zip: normalized,
      lat,
      lng,
      city: place["place name"] ?? null,
      state: place["state abbreviation"] ?? null,
    };
  } catch {
    return null;
  }
}

export function findNearestMarket(
  lat: number,
  lng: number,
): NearestMarketResult | null {
  const markets = liveMarkets();
  if (!markets.length) return null;

  let best: NearestMarketResult | null = null;
  for (const market of markets) {
    const distanceMiles = haversineMiles(
      lat,
      lng,
      market.centerLat,
      market.centerLng,
    );
    if (!best || distanceMiles < best.distanceMiles) {
      best = { market, distanceMiles };
    }
  }
  return best;
}

function ratesFromMagnet(
  magnet: MarketMagnet | null,
  rvClass: RoiRvClass | null,
): Pick<
  RoiMarketDefaults,
  "medianRate" | "rateSource" | "listingCount" | "classCount" | "asOf"
> {
  let medianRate: number | null = null;
  let rateSource: "class" | "market" | null = null;
  let classCount = 0;

  if (magnet && rvClass) {
    const row = magnet.byClass.find((c) => c.class === rvClass);
    if (row?.medianRate != null && row.count >= MIN_CLASS_SAMPLE) {
      medianRate = row.medianRate;
      classCount = row.count;
      rateSource = "class";
    } else if (row) {
      classCount = row.count;
    }
  }

  if (medianRate == null && magnet?.medianRate != null) {
    medianRate = magnet.medianRate;
    rateSource = "market";
  }

  return {
    medianRate,
    rateSource,
    listingCount: magnet?.listingCount ?? 0,
    classCount,
    asOf: magnet?.asOf ?? null,
  };
}

/** Direct market-page seed — no ZIP geocode. */
export function resolveRoiMarketDefaultsBySlug(
  slug: string,
  rvClassRaw: string | null,
): RoiMarketDefaults | { error: string; status: number } {
  const market = MARKET_BY_SLUG[slug];
  if (!market?.isLive) {
    return { error: "Unknown market.", status: 404 };
  }

  const rvClass =
    rvClassRaw && isRoiRvClass(rvClassRaw) ? rvClassRaw : null;
  const magnet = getMarketMagnet(market.slug);
  const rates = ratesFromMagnet(magnet, rvClass);

  return {
    zip: "",
    city: null,
    state: null,
    marketSlug: market.slug,
    marketName: market.displayName,
    distanceMiles: 0,
    ...rates,
    rvClass,
  };
}

export async function resolveRoiMarketDefaults(
  zip: string,
  rvClassRaw: string | null,
): Promise<RoiMarketDefaults | { error: string; status: number }> {
  const coords = await geocodeUsZip(zip);
  if (!coords) {
    return { error: "Enter a valid 5-digit US ZIP code.", status: 400 };
  }

  const nearest = findNearestMarket(coords.lat, coords.lng);
  if (!nearest) {
    return { error: "No RVIntel markets available.", status: 503 };
  }

  const rvClass =
    rvClassRaw && isRoiRvClass(rvClassRaw) ? rvClassRaw : null;
  const magnet = getMarketMagnet(nearest.market.slug);
  const rates = ratesFromMagnet(magnet, rvClass);

  return {
    zip: coords.zip,
    city: coords.city,
    state: coords.state,
    marketSlug: nearest.market.slug,
    marketName: nearest.market.displayName,
    distanceMiles: Math.round(nearest.distanceMiles * 10) / 10,
    ...rates,
    rvClass,
  };
}
