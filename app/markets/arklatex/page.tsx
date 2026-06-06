import type { Metadata } from "next";

import { MarketReportViewer } from "@/components/market-report-viewer";

const REPORT_PATH = "/reports/arklatex-rv-market-report-q2-2026.pdf";

export const metadata: Metadata = {
  title: "ArkLaTex RV Rental Market Report — Q2 2026 | RVIntel",
  description:
    "Q2 2026 market intelligence report for the ArkLaTex RV rental market: pricing, demand, and competitive benchmarks across Outdoorsy and RVshare.",
};

export default function ArklatexMarketPage() {
  return (
    <MarketReportViewer
      reportPath={REPORT_PATH}
      region="ArkLaTex"
      title="ArkLaTex RV Rental Market Report"
      period="Q2 2026"
      description="Pricing benchmarks, platform breakdown, and occupancy signals across active listings on Outdoorsy and RVshare. Search anchored to the Shreveport–Bossier metro. Updated quarterly."
      downloadFileName="arklatex-rv-market-report-q2-2026.pdf"
    />
  );
}
