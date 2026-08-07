import Link from "next/link";
import {
  MapPin,
  BarChart3,
  BookOpen,
  Download,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StartTrialCta } from "@/components/start-trial-cta";
import { ClassRangeChart } from "@/components/class-range-chart";
import { DashboardCtaButton } from "@/components/dashboard-cta-button";
import { JsonLd } from "@/lib/json-ld";
import { nearbyMarkets } from "@/lib/markets";
import type { MarketStats } from "@/lib/market-stats";
import type { MarketMagnet } from "@/lib/market-magnets";
import type { MarketReportRef } from "@/lib/market-reports";

const RELATED_GUIDES = [
  {
    slug: "comp-analysis",
    category: "Market Analysis",
    title: "How to Read a Competitive Landscape",
  },
  {
    slug: "dynamic-pricing-101",
    category: "Pricing Strategy",
    title: "Dynamic Pricing 101 for RV Rental Hosts",
  },
  {
    slug: "peak-season-playbook",
    category: "Seasonal Trends",
    title: "The Peak Season Playbook",
  },
];

type Props = {
  slug: string;
  displayName: string;
  region: string;
  radiusMiles: number;
  stats: MarketStats;
  hasDiscovery: boolean;
  magnet: MarketMagnet | null;
  report: MarketReportRef | null;
};

function fmtMoney(n: number | null) {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export function MarketLanding({
  slug,
  displayName,
  region,
  radiusMiles,
  stats,
  hasDiscovery,
  magnet,
  report,
}: Props) {
  const listingCount = magnet?.listingCount ?? stats.listingCount;
  const avgRate = magnet?.avgRate ?? stats.avgRate;
  const medianRate = magnet?.medianRate ?? stats.medianRate;
  const outdoorsyCount = magnet?.outdoorsyCount ?? stats.outdoorsyCount;
  const rvshareCount = magnet?.rvshareCount ?? stats.rvshareCount;
  const hasData = listingCount > 0;
  const introHtml = magnet?.seo.introHtml;
  const faq = magnet?.seo.faq ?? [];
  const byClass = magnet?.byClass ?? [];
  const nearby = nearbyMarkets(slug);

  const faqLd =
    faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-background">
      {faqLd ? <JsonLd data={faqLd} /> : null}
      <SiteHeader />
      <main className="pt-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground font-medium transition-colors mb-8"
        >
          ← All markets
        </Link>

        <div className="relative rounded-sm overflow-hidden bg-muted/30 p-8 sm:p-10 mb-8">
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
            style={{ background: "linear-gradient(180deg, #006b5f, #2dd4bf)" }}
          />
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
              {region} · {radiusMiles} mi radius
            </span>
          </div>
          <h1 className="text-[2rem] sm:text-[2.5rem] font-semibold tracking-tight mb-3">
            {displayName} RV Rental Market
          </h1>
          {!introHtml && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {hasDiscovery
                ? "Live geo-scoped pricing across Outdoorsy and RVshare. Dashboard updates as discovery crons run."
                : "Display market — inventory is drawn from overlapping discovery sweeps (LA / Bay Area)."}
            </p>
          )}
          {magnet?.asOfLabel && (
            <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground mt-4">
              Data as of {magnet.asOfLabel}
            </p>
          )}
        </div>

        {introHtml && (
          <div
            className="prose prose-sm max-w-none text-muted-foreground mb-10 [&_strong]:text-foreground [&_p]:leading-relaxed [&_p+p]:mt-4"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        )}

        {magnet && (
          <ClassRangeChart
            byClass={byClass}
            medianRate={medianRate}
            chartMin={magnet.chartMin}
            chartMax={magnet.chartMax}
          />
        )}

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Active listings",
              value: hasData ? listingCount.toLocaleString() : "—",
            },
            { label: "Avg / night", value: fmtMoney(avgRate) },
            { label: "Median / night", value: fmtMoney(medianRate) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-muted/30 rounded-sm p-5">
              <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                {label}
              </div>
              <div className="text-[1.5rem] font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </div>

        {hasData && (
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-8">
            <span className="inline-flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Outdoorsy: {outdoorsyCount.toLocaleString()}
            </span>
            <span>RVshare: {rvshareCount.toLocaleString()}</span>
            {magnet?.p25 != null && magnet?.p75 != null && (
              <span>
                P25–P75: {fmtMoney(magnet.p25)} – {fmtMoney(magnet.p75)}
              </span>
            )}
          </div>
        )}

        {byClass.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground mb-4">
              Class detail
            </h2>
            <div className="overflow-x-auto rounded-sm bg-muted/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[0.625rem] uppercase tracking-[0.05em] text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium text-right">Listings</th>
                    <th className="px-4 py-3 font-medium text-right">Median / night</th>
                    <th className="px-4 py-3 font-medium text-right">Middle 50%</th>
                  </tr>
                </thead>
                <tbody>
                  {byClass.map((row) => (
                    <tr key={row.class} className="border-t border-border/40">
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {fmtMoney(row.medianRate)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {row.p25 !== null && row.p75 !== null
                          ? `${fmtMoney(row.p25)} – ${fmtMoney(row.p75)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3 mb-4">
          <DashboardCtaButton slug={slug} />
          {magnet?.magnetPath && (
            <Button asChild variant="outline" className="rounded-sm">
              <Link href={magnet.magnetPath} target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4 mr-1.5" />
                Download the {displayName} rate card
              </Link>
            </Button>
          )}
          {report && (
            <Button asChild variant="outline" className="rounded-sm">
              <Link href={report.path} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4 mr-1.5" />
                {report.period} report
              </Link>
            </Button>
          )}
        </div>

        <div className="mb-10">
          <StartTrialCta showSubtext />
        </div>

        {!hasData && (
          <p className="text-sm text-muted-foreground mb-10">
            Discovery backfill in progress — check back after the first cron sweep completes.
          </p>
        )}

        {faq.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold tracking-tight mb-6">
              {displayName} RV rental FAQ
            </h2>
            <div className="space-y-3">
              {faq.map((item) => (
                <details
                  key={item.question}
                  className="group bg-muted/30 rounded-sm px-5 py-4 open:bg-muted/40"
                >
                  <summary className="cursor-pointer list-none font-medium text-sm pr-6 relative after:content-['+'] after:absolute after:right-0 after:top-0 after:text-muted-foreground group-open:after:content-['−']">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        {nearby.length > 0 && (
          <div className="pt-12 border-t border-border">
            <p className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground mb-6 flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              Nearby markets
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {nearby.map(({ market, distanceMiles }) => (
                <Link
                  key={market.slug}
                  href={`/markets/${market.slug}`}
                  className="group block bg-muted/30 hover:bg-muted/50 rounded-sm p-5 transition-colors"
                >
                  <div
                    className="h-0.5 w-full mb-4"
                    style={{ background: "linear-gradient(90deg, #006b5f, #2dd4bf)" }}
                  />
                  <span className="text-[0.625rem] uppercase tracking-[0.05em] text-primary font-medium block mb-2">
                    {market.region} · {Math.round(distanceMiles)} mi
                  </span>
                  <p className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                    {market.displayName} RV rental market
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="pt-12 border-t border-border">
          <p className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground mb-6 flex items-center gap-2">
            <BookOpen className="w-3 h-3" />
            Pricing guides for {displayName} hosts
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {RELATED_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/learn/${guide.slug}`}
                className="group block bg-muted/30 hover:bg-muted/50 rounded-sm p-5 transition-colors"
              >
                <div
                  className="h-0.5 w-full mb-4"
                  style={{ background: "linear-gradient(90deg, #006b5f, #2dd4bf)" }}
                />
                <span className="text-[0.625rem] uppercase tracking-[0.05em] text-primary font-medium block mb-2">
                  {guide.category}
                </span>
                <p className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                  {guide.title}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
