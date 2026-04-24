"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Sun,
  TrendingUp,
  Users,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { MarketView } from "@/components/market-view";

type DateWindow = "7d" | "30d" | "90d";

const MARKET_HIGHLIGHTS = [
  {
    icon: Sun,
    title: "Year-Round Demand",
    body: "San Diego's mild climate drives consistent RV rental demand across all seasons — unlike most US markets that see 60%+ of bookings in a 3-month peak.",
  },
  {
    icon: TrendingUp,
    title: "Premium Rate Ceiling",
    body: "Proximity to Anza-Borrego, Joshua Tree, and the Pacific coast supports above-average nightly rates, especially for Class B vans popular with surf and outdoor travelers.",
  },
  {
    icon: Users,
    title: "Cross-Platform Competition",
    body: "Active listings across both Outdoorsy and RVshare create meaningful rate variance. Cross-listed vehicles often show $20–$40/night spread between platforms.",
  },
];

export default function SanDiegoMarketPage() {
  const [rvClass, setRvClass] = useState("Class B");
  const [dateWindow, setDateWindow] = useState<DateWindow>("30d");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-16">
        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
            <Link href="/markets" className="hover:text-foreground transition-colors">
              Markets
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground">San Diego</span>
          </div>
        </div>

        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              <MapPin className="w-3 h-3" />
              San Diego, CA · Pacific Coast
            </div>
            <h1 className="text-[3.5rem] font-semibold tracking-tight leading-none mb-4">
              San Diego RV<br />Rental Market
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Live pricing data, rate trends, and competitive benchmarks for RV rentals in the San Diego metro — updated weekly from active listings on Outdoorsy and RVshare.
            </p>
          </div>
        </section>

        {/* Market highlights */}
        <section className="bg-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid sm:grid-cols-3 gap-6">
              {MARKET_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">{title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live data */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
          {/* Section header + filters */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-3">
                <TrendingUp className="w-3 h-3" />
                Live Market Data
              </div>
              <h2 className="text-[1.5rem] font-semibold tracking-tight leading-tight">
                Current Rates &amp; Comps
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 pb-0.5">
              <div className="flex items-center gap-2">
                <label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium whitespace-nowrap">
                  RV Class
                </label>
                <Select value={rvClass} onValueChange={setRvClass}>
                  <SelectTrigger className="w-40 h-8 text-sm rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Class B">Class B</SelectItem>
                    <SelectItem value="Class A">Class A</SelectItem>
                    <SelectItem value="Class C">Class C</SelectItem>
                    <SelectItem value="Travel Trailer">Travel Trailer</SelectItem>
                    <SelectItem value="Fifth Wheel">Fifth Wheel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium whitespace-nowrap">
                  Window
                </label>
                <Select
                  value={dateWindow}
                  onValueChange={(v) => setDateWindow(v as DateWindow)}
                >
                  <SelectTrigger className="w-32 h-8 text-sm rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <MarketView
            market="san-diego-ca"
            rvClass={rvClass}
            dateWindow={dateWindow}
            onDateWindowChange={setDateWindow}
            showInlineWindowSelector={false}
          />
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-sm bg-muted/40 px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-[1.5rem] font-semibold tracking-tight mb-1">
                Host an RV in San Diego?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Get weekly rate alerts, occupancy benchmarks, and pricing recommendations tailored to your vehicle and market segment.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Button variant="outline" size="lg" className="rounded-sm" asChild>
                <Link href="/markets" className="inline-flex items-center gap-2">
                  All Markets <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="rounded-sm"
                style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
              >
                <Link href="/#waitlist">Join the Waitlist</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
