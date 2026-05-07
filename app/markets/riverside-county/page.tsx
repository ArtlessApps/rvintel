import type { Metadata } from "next";

import { MarketReportViewer } from "@/components/market-report-viewer";

const REPORT_PATH = "/reports/riverside-county-rv-market-report-q2-2026.pdf";

export const metadata: Metadata = {
  title: "Riverside County RV Rental Market Report — Q2 2026 | RVIntel",
  description:
    "Q2 2026 market intelligence report for the Riverside County RV rental market: pricing, demand, and competitive benchmarks across Outdoorsy and RVshare.",
};

export default function RiversideCountyMarketPage() {
  return (
    <MarketReportViewer
      reportPath={REPORT_PATH}
      region="Riverside County, CA"
      title="Riverside County RV Rental Market Report"
      period="Q2 2026"
      description="Pricing benchmarks, platform breakdown, and occupancy signals across active listings on Outdoorsy and RVshare. Updated quarterly."
      downloadFileName="riverside-county-rv-market-report-q2-2026.pdf"
    />
  );
}
