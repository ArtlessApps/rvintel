import type { OutdoorsyClassCode } from "@/lib/outdoorsy-api";
import { discoveryMarkets } from "@/lib/markets";

export type ScrapeTarget = { platform: "outdoorsy" | "rvshare"; url: string; group?: string };

export type OutdoorsyApiTarget = {
  address: string;
  classCode: OutdoorsyClassCode;
  group: string;
};

const OUTDOORSY_CLASS_GROUPS: { classCode: OutdoorsyClassCode; group: string }[] = [
  { classCode: "a", group: "1" },
  { classCode: "b", group: "1" },
  { classCode: "c", group: "2" },
  { classCode: "trailer", group: "2" },
  { classCode: "fifth-wheel", group: "2" },
];

const RVSHARE_TYPES = [
  "class-a",
  "class-b",
  "class-c",
  "travel-trailer",
  "fifth-wheel",
  "toy-hauler",
  "pop-up",
  "truck-camper",
] as const;

function rvshareLocationParam(location: string): string {
  return location.replace(/ /g, "+");
}

function outdoorsyAddressParam(address: string): string {
  return encodeURIComponent(address);
}

export function buildOutdoorsyApiTargets(): Record<string, OutdoorsyApiTarget[]> {
  const out: Record<string, OutdoorsyApiTarget[]> = {};
  for (const m of discoveryMarkets()) {
    out[m.slug] = OUTDOORSY_CLASS_GROUPS.map(({ classCode, group }) => ({
      address: m.outdoorsyAddress!,
      classCode,
      group,
    }));
  }
  return out;
}

export function buildRvshareApiTargets(): Record<string, { location: string }> {
  const out: Record<string, { location: string }> = {};
  for (const m of discoveryMarkets()) {
    out[m.slug] = { location: m.rvshareLocation! };
  }
  return out;
}

export function buildRvshareFirecrawlTargets(): Record<string, ScrapeTarget[]> {
  const out: Record<string, ScrapeTarget[]> = {};
  for (const m of discoveryMarkets()) {
    const loc = rvshareLocationParam(m.rvshareLocation!);
    out[m.slug] = RVSHARE_TYPES.map((type, i) => ({
      platform: "rvshare" as const,
      group: i < 4 ? "1" : "2",
      url: `https://rvshare.com/rv-rental?location=${loc}&type=${type}`,
    }));
  }
  return out;
}

export function buildOutdoorsyFirecrawlTargets(): Record<string, ScrapeTarget[]> {
  const out: Record<string, ScrapeTarget[]> = {};
  for (const m of discoveryMarkets()) {
    const addr = outdoorsyAddressParam(m.outdoorsyAddress!);
    out[m.slug] = [
      {
        platform: "outdoorsy",
        group: "1",
        url: `https://www.outdoorsy.com/rv-search?address=${addr}&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=b`,
      },
      {
        platform: "outdoorsy",
        group: "1",
        url: `https://www.outdoorsy.com/rv-search?address=${addr}&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=a`,
      },
      {
        platform: "outdoorsy",
        group: "2",
        url: `https://www.outdoorsy.com/rv-search?address=${addr}&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=c`,
      },
      {
        platform: "outdoorsy",
        group: "2",
        url: `https://www.outdoorsy.com/rv-search?address=${addr}&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=tt`,
      },
    ];
  }
  return out;
}

export const OUTDOORSY_API_TARGETS = buildOutdoorsyApiTargets();
export const RVSHARE_API_TARGETS = buildRvshareApiTargets();
export const MARKET_TARGETS = buildRvshareFirecrawlTargets();
export const OUTDOORSY_FIRECRAWL_TARGETS = buildOutdoorsyFirecrawlTargets();
