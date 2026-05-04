"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { useIsMobile } from "@/hooks/use-mobile";

type MarketReportViewerProps = {
  reportPath: string;
  region: string;
  title: string;
  period: string;
  description: string;
  downloadFileName?: string;
};

export function MarketReportViewer({
  reportPath,
  region,
  title,
  period,
  description,
  downloadFileName,
}: MarketReportViewerProps) {
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setMounted(true);
  }, []);

  const showFallback = !mounted || isMobile;

  if (showFallback) {
    return (
      <ReportFallback
        reportPath={reportPath}
        region={region}
        title={title}
        period={period}
        description={description}
        downloadFileName={downloadFileName}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-background">
      <object
        data={reportPath}
        type="application/pdf"
        className="w-full h-full"
        aria-label={`${title} — ${period}`}
      >
        <ReportFallback
          reportPath={reportPath}
          region={region}
          title={title}
          period={period}
          description={description}
          downloadFileName={downloadFileName}
          embedded
        />
      </object>
    </div>
  );
}

function ReportFallback({
  reportPath,
  region,
  title,
  period,
  description,
  downloadFileName,
  embedded = false,
}: MarketReportViewerProps & { embedded?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      {!embedded && <SiteHeader />}

      <main className={embedded ? "pt-12 pb-16" : "pt-16 pb-16"}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
          <Link
            href="/markets"
            className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground font-medium transition-colors mb-8"
          >
            <ArrowLeft className="w-3 h-3" />
            All markets
          </Link>

          <div className="relative rounded-sm overflow-hidden bg-muted/30 p-8 sm:p-10">
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: "linear-gradient(180deg, #006b5f, #2dd4bf)" }}
              aria-hidden
            />

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-5">
              <MapPin className="w-3 h-3" />
              {region} · {period}
            </div>

            <h1 className="text-[2.5rem] sm:text-[3rem] font-semibold tracking-tight leading-[1.05] mb-4">
              {title}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mb-8">
              {description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-sm"
                style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
              >
                <a
                  href={reportPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  Open report
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </Button>

              <Button asChild variant="outline" size="lg" className="rounded-sm">
                <a
                  href={reportPath}
                  download={downloadFileName}
                  className="inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </a>
              </Button>
            </div>
          </div>

          <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium text-center mt-8">
            PDF · Optimized for desktop viewing
          </p>
        </div>
      </main>
    </div>
  );
}
