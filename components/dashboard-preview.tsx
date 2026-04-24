"use client";

import { Logo } from "@/components/logo";
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  MapPin,
  Car,
  Calendar,
  Sparkles,
} from "lucide-react";

export function DashboardPreview() {
  return (
    <div className="relative">
      {/* Glow effect behind dashboard */}
      <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-2xl transform scale-105" />

      {/* Dashboard Container */}
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-8">
            <Logo height="h-7" />
            <nav className="hidden lg:flex items-center gap-6">
              <span className="text-sm font-medium text-primary">DASHBOARD</span>
              <span className="text-sm text-muted-foreground">ANALYTICS</span>
              <span className="text-sm text-muted-foreground">ASSETS</span>
              <span className="text-sm text-muted-foreground">FORECASTING</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
              <div className="w-4 h-4 rounded-full bg-muted" />
              <span className="text-sm text-muted-foreground">Search analytics...</span>
            </div>
            <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg">
              Export Data
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex">
          {/* Sidebar */}
          <div className="hidden md:block w-48 border-r border-border p-4 bg-secondary/30">
            <div className="mb-6">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                CONTROL CENTER
              </div>
              <div className="text-xs text-muted-foreground">
                Operational Intelligence
              </div>
            </div>

            <nav className="space-y-1">
              {[
                { label: "Overview", active: true },
                { label: "My Fleet" },
                { label: "Fleet Status" },
                { label: "Pricing Engine" },
                { label: "Market Intel" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    item.active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </nav>
          </div>

          {/* Main Dashboard Area */}
          <div className="flex-1 p-6 bg-secondary/20">
            {/* Header */}
            <div className="mb-6">
              <div className="text-xs font-semibold text-muted-foreground tracking-wide mb-1">
                MARKET INTELLIGENCE
              </div>
              <h2 className="text-xl font-bold text-foreground">
                Market Positioning Dashboard
              </h2>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              {[
                { icon: MapPin, label: "Austin, TX" },
                { icon: Car, label: "Class B" },
                { icon: Calendar, label: "Next 60 Days" },
              ].map((filter) => (
                <div
                  key={filter.label}
                  className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm"
                >
                  <filter.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{filter.label}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "REVPAR", value: "$185", change: "+5%", up: true },
                { label: "REALIZED ADR", value: "$220", change: "+2%", up: true },
                { label: "CURRENT OCCUPANCY", value: "82%", change: "-3%", up: false },
                { label: "ACTIVE LOCAL INVENTORY", value: "45", change: "STABLE", neutral: true },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="bg-card p-4 rounded-xl border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      {metric.label}
                    </span>
                    {!metric.neutral && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          metric.up
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {metric.change}
                      </span>
                    )}
                    {metric.neutral && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {metric.change}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {metric.value}
                  </div>
                  <div className="mt-2 h-1 bg-primary/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: metric.up ? "70%" : metric.neutral ? "50%" : "40%" }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
              {/* Forward-Looking Pacing Chart */}
              <div className="lg:col-span-2 bg-card p-5 rounded-xl border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground">
                    Forward-Looking Pacing
                  </h3>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-muted-foreground">Your Fleet</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                      <span className="text-muted-foreground">Market Avg</span>
                    </div>
                  </div>
                </div>

                {/* Mock Chart */}
                <div className="h-32 relative">
                  <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                    {/* Market average line */}
                    <path
                      d="M0,70 Q50,65 100,60 T200,55 T300,45 T400,40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      className="text-muted-foreground/30"
                    />
                    {/* Your fleet line */}
                    <path
                      d="M0,75 Q50,70 100,60 T200,50 T300,30 T400,25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-primary"
                    />
                    {/* Peak demand label */}
                    <circle cx="320" cy="28" r="4" className="fill-primary" />
                    <text x="295" y="18" className="fill-primary text-[8px] font-medium">
                      PEAK DEMAND
                    </text>
                  </svg>
                </div>
              </div>

              {/* Avg Lead Time Card */}
              <div className="bg-primary p-5 rounded-xl text-primary-foreground">
                <div className="text-xs font-semibold mb-2 opacity-80">
                  AVG LEAD TIME
                </div>
                <div className="text-4xl font-bold mb-1">
                  42 <span className="text-lg font-normal">Days</span>
                </div>
                <p className="text-sm opacity-80 leading-relaxed">
                  +12 days from previous month cycle. Renters are booking earlier
                  for fall foliage.
                </p>
              </div>
            </div>

            {/* Smart Recommendation */}
            <div className="bg-card p-5 rounded-xl border border-border">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">
                      Smart Recommendation
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      MARKET ALERT
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A major outdoor festival was announced for Oct 12-14 in Austin.
                    Class B inventory is already 40% booked. We recommend a{" "}
                    <span className="font-semibold text-foreground">
                      25% price lift
                    </span>{" "}
                    for these dates.
                  </p>
                  <button className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg">
                    Apply Optimized Rates
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive hint */}
      <div className="text-center mt-6">
        <p className="text-sm text-muted-foreground">
          ✨ This is just a preview — the real dashboard is even more powerful
        </p>
      </div>
    </div>
  );
}
