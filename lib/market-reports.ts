import fs from "node:fs";
import path from "node:path";
import { MARKET_BY_SLUG } from "@/lib/markets";

export type MarketReportRef = {
  path: string;
  period: string;
  fileName: string;
  format: "pdf" | "html";
};

const PERIOD = "Q2 2026";

/** Static PDF reports under /public/reports. */
export const MARKET_REPORTS: Partial<Record<string, MarketReportRef>> = {
  "san-diego-ca": {
    path: "/reports/san-diego-rv-market-report-q2-2026.pdf",
    period: PERIOD,
    fileName: "san-diego-rv-market-report-q2-2026.pdf",
    format: "pdf",
  },
};

function currentQuarterFile(slug: string, ext: "html" | "pdf") {
  const year = new Date().getFullYear();
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  const fileName = `${slug}-rv-market-report-q${q}-${year}.${ext}`;
  const full = path.join(process.cwd(), "public", "reports", fileName);
  if (!fs.existsSync(full)) return null;
  return {
    path: `/reports/${fileName}`,
    period: `Q${q} ${year}`,
    fileName,
    format: ext,
  } satisfies MarketReportRef;
}

export function marketReportForSlug(slug: string): MarketReportRef | null {
  return (
    MARKET_REPORTS[slug] ??
    currentQuarterFile(slug, "html") ??
    currentQuarterFile(slug, "pdf") ??
    null
  );
}

export function marketPageTitle(slug: string): string {
  const name = MARKET_BY_SLUG[slug]?.displayName ?? slug;
  return `${name} RV Rental Market Report`;
}
