import Link from "next/link";
import { Calculator } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RoiCalculator } from "@/components/roi-calculator";
import { JsonLd } from "@/lib/json-ld";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata = {
  title: "RV Rental ROI Calculator",
  description:
    "Estimate cash-on-cash ROI for renting out your RV. Factor in platform fees, insurance, maintenance, taxes, and local median rates from RVIntel market data.",
  alternates: {
    canonical: "/tools/roi-calculator",
  },
  openGraph: {
    title: "RV Rental ROI Calculator · RVIntel",
    description:
      "Calculate whether renting out your RV is worth it — with market-backed nightly rates and a full expense model.",
    url: `${SITE_URL}/tools/roi-calculator`,
  },
};

const FAQS = [
  {
    question: "How is RV rental ROI calculated?",
    answer:
      "Cash-on-cash ROI divides annual net operating income (gross rental revenue minus platform fees, cleaning, maintenance, insurance, storage, registration, supplies, and loan payments) by the cash you invested. Payback years equal cash invested divided by annual NOI.",
  },
  {
    question: "Where do the nightly rate defaults come from?",
    answer:
      "When you enter a US ZIP code, RVIntel finds the nearest tracked market and autofills the median asking rate for your RV class from live Outdoorsy and RVshare listing data. You can override the rate at any time.",
  },
  {
    question: "What costs should I include when renting out an RV?",
    answer:
      "Beyond platform commissions (often around 20–25%), budget for commercial rental insurance, storage, registration, maintenance and repairs (commonly ~1–2% of RV value per year), cleaning between guests, supplies, loan payments, and depreciation if you want an economic return picture.",
  },
  {
    question: "Is renting out an RV really passive income?",
    answer:
      "Usually not. Most hosts spend several hours per week on messaging, turnovers, and maintenance. The calculator includes an hours-per-week input so you can see an effective hourly return alongside ROI.",
  },
  {
    question: "Are the tax estimates official?",
    answer:
      "No. The tax rate slider is a rough blended estimate for illustration only and is not tax advice. Consult a qualified tax professional for depreciation, Schedule C, and self-employment tax questions.",
  },
];

export default function RoiCalculatorPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "RV Rental ROI Calculator",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/tools/roi-calculator`,
      description:
        "Estimate RV rental cash-on-cash ROI using market-backed nightly rates and a full operating expense model.",
      provider: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="pt-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              <Calculator className="w-3 h-3" />
              Free tool · RVIntel
            </div>
            <h1 className="text-[2.5rem] sm:text-[3.5rem] font-semibold tracking-tight leading-none mb-4">
              RV Rental ROI Calculator
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              Enter your cost, RV type, and ZIP to estimate cash-on-cash return —
              including platform fees, repairs, insurance, and taxes — with
              nightly rates backed by RVIntel market data.
            </p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <RoiCalculator />
        </section>

        <section className="bg-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-4">
                How this calculator works
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Gross revenue is nightly rate × rental nights per year. We
                  subtract platform fees, cleaning (from turnovers), maintenance
                  as a percent of RV value, insurance, storage, registration,
                  supplies, and loan payments to get net operating income (NOI).
                </p>
                <p>
                  Cash-on-cash ROI is NOI ÷ cash invested. Economic ROI
                  optionally subtracts depreciation. After-tax NOI applies your
                  estimated tax rate for a rough take-home view.
                </p>
                <p>
                  Rate defaults come from the nearest{" "}
                  <Link href="/markets" className="text-primary hover:underline">
                    RVIntel market
                  </Link>{" "}
                  median for your RV class. Nights-per-year are assumptions until
                  occupancy tracking ships — adjust them to match your market.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-4">
                FAQ
              </h2>
              <dl className="space-y-5">
                {FAQS.map((faq) => (
                  <div key={faq.question}>
                    <dt className="text-sm font-medium mb-1.5">{faq.question}</dt>
                    <dd className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Estimates only. Actual results vary by listing quality, seasonality,
            damage, and management. RVIntel provides market intelligence tools;
            this calculator is not financial, legal, or tax advice. Learn more in{" "}
            <Link
              href="/learn/how-to-start-rv-rental-business"
              className="text-primary hover:underline"
            >
              how to start an RV rental business
            </Link>{" "}
            and{" "}
            <Link
              href="/learn/increase-rv-rental-profit"
              className="text-primary hover:underline"
            >
              how to increase profit
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
