"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowLeft,
  RefreshCw,
  Star,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Dummy data ───────────────────────────────────────────────────────────────

const COMP_LISTINGS = [
  {
    id: "1",
    host: "SoCal Vans",
    rv_year: 2022,
    rv_make: "Winnebago",
    rv_model: "Travato 59K",
    nightly_rate: 249,
    weekly_rate: 1449,
    review_count: 87,
    avg_rating: 4.9,
    occupancy_est: 78,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "2",
    host: "Pacific Coast Rentals",
    rv_year: 2023,
    rv_make: "Mercedes-Benz",
    rv_model: "Sprinter 2500",
    nightly_rate: 279,
    weekly_rate: 1649,
    review_count: 44,
    avg_rating: 4.8,
    occupancy_est: 71,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "3",
    host: "Sun & Road",
    rv_year: 2021,
    rv_make: "Airstream",
    rv_model: "Interstate 24GT",
    nightly_rate: 269,
    weekly_rate: 1549,
    review_count: 112,
    avg_rating: 4.9,
    occupancy_est: 84,
    platform: "rvshare",
    listing_url: "#",
  },
  {
    id: "4",
    host: "Beach Break RV",
    rv_year: 2020,
    rv_make: "Winnebago",
    rv_model: "Revel 44E",
    nightly_rate: 199,
    weekly_rate: 1149,
    review_count: 63,
    avg_rating: 4.7,
    occupancy_est: 65,
    platform: "rvshare",
    listing_url: "#",
  },
  {
    id: "5",
    host: "Nomad Life Rentals",
    rv_year: 2022,
    rv_make: "Storyteller",
    rv_model: "Overland MODE",
    nightly_rate: 289,
    weekly_rate: 1749,
    review_count: 29,
    avg_rating: 4.8,
    occupancy_est: 59,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "6",
    host: "Coastal Campers",
    rv_year: 2019,
    rv_make: "Ford",
    rv_model: "Transit 350 Conversion",
    nightly_rate: 175,
    weekly_rate: 999,
    review_count: 156,
    avg_rating: 4.6,
    occupancy_est: 76,
    platform: "rvshare",
    listing_url: "#",
  },
  {
    id: "7",
    host: "Wild West Vans",
    rv_year: 2023,
    rv_make: "Winnebago",
    rv_model: "Travato 59GL",
    nightly_rate: 259,
    weekly_rate: 1499,
    review_count: 18,
    avg_rating: 5.0,
    occupancy_est: 62,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "8",
    host: "Sunset Expeditions",
    rv_year: 2021,
    rv_make: "Ram",
    rv_model: "ProMaster 3500 High Roof",
    nightly_rate: 159,
    weekly_rate: 899,
    review_count: 74,
    avg_rating: 4.5,
    occupancy_est: 69,
    platform: "rvshare",
    listing_url: "#",
  },
  {
    id: "9",
    host: "Baja Bound Rentals",
    rv_year: 2022,
    rv_make: "Airstream",
    rv_model: "Interstate 19",
    nightly_rate: 229,
    weekly_rate: 1299,
    review_count: 51,
    avg_rating: 4.7,
    occupancy_est: 73,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "10",
    host: "Freedom Wheels SD",
    rv_year: 2020,
    rv_make: "Mercedes-Benz",
    rv_model: "Metris Weekender",
    nightly_rate: 149,
    weekly_rate: 849,
    review_count: 93,
    avg_rating: 4.6,
    occupancy_est: 81,
    platform: "rvshare",
    listing_url: "#",
  },
  {
    id: "11",
    host: "California Vans Co",
    rv_year: 2023,
    rv_make: "Winnebago",
    rv_model: "Solis Pocket 36A",
    nightly_rate: 219,
    weekly_rate: 1249,
    review_count: 37,
    avg_rating: 4.9,
    occupancy_est: 67,
    platform: "outdoorsy",
    listing_url: "#",
  },
  {
    id: "12",
    host: "Torrey Pines Rentals",
    rv_year: 2021,
    rv_make: "Hymer",
    rv_model: "Aktiv 2.0",
    nightly_rate: 239,
    weekly_rate: 1399,
    review_count: 22,
    avg_rating: 4.8,
    occupancy_est: 55,
    platform: "rvshare",
    listing_url: "#",
  },
];

const RATE_DISTRIBUTION = [
  { range: "$100–149", count: 1 },
  { range: "$150–199", count: 3 },
  { range: "$200–249", count: 4 },
  { range: "$250–299", count: 4 },
];

const YOUR_RATE = 225;
const AVG_MARKET_RATE = Math.round(
  COMP_LISTINGS.reduce((sum, l) => sum + l.nightly_rate, 0) / COMP_LISTINGS.length
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "neutral";
}) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
      ? "text-rose-500"
      : "text-muted-foreground";

  return (
    <div className="bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        {label}
      </p>
      <p className="text-3xl font-bold text-foreground tracking-tight mb-1">
        {value}
      </p>
      <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
        <TrendIcon className="w-3.5 h-3.5" />
        <span>{sub}</span>
      </div>
    </div>
  );
}

function OccupancyBar({ pct }: { pct: number }) {
  const color =
    pct >= 75
      ? "bg-emerald-500"
      : pct >= 55
      ? "bg-amber-400"
      : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">
          {payload[0].value} listing{payload[0].value !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [market, setMarket] = useState("san-diego-ca");
  const [rvClass, setRvClass] = useState("Class B");
  const [dateWindow, setDateWindow] = useState("30d");

  const avgMarketRate = AVG_MARKET_RATE;
  const yourRate = YOUR_RATE;
  const positionPct = Math.round(((yourRate - avgMarketRate) / avgMarketRate) * 100);
  const positionSign = positionPct >= 0 ? "+" : "";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-[20px] border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">RVIntel</span>
            </Link>
            <span className="text-border">|</span>
            <span className="text-sm text-muted-foreground">Market Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground hidden sm:block">
              Data last updated:{" "}
              <span className="text-foreground font-medium">Apr 19, 2026 · 6:00 AM PDT</span>
            </p>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              Market
            </label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="san-diego-ca">San Diego, CA</SelectItem>
                <SelectItem value="los-angeles-ca">Los Angeles, CA</SelectItem>
                <SelectItem value="denver-co">Denver, CO</SelectItem>
                <SelectItem value="austin-tx">Austin, TX</SelectItem>
                <SelectItem value="miami-fl">Miami, FL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              RV Class
            </label>
            <Select value={rvClass} onValueChange={setRvClass}>
              <SelectTrigger className="w-36 h-9 text-sm">
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
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              Window
            </label>
            <Select value={dateWindow} onValueChange={setDateWindow}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Badge variant="secondary" className="ml-auto text-xs">
            {COMP_LISTINGS.length} listings · {rvClass} · San Diego
          </Badge>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Avg Market Rate"
            value={`$${avgMarketRate}/night`}
            sub="vs. $198 last month"
            trend="up"
          />
          <MetricCard
            label="Your Position"
            value={`${positionSign}${positionPct}%`}
            sub={
              positionPct < 0
                ? `$${Math.abs(yourRate - avgMarketRate)} below market avg`
                : `$${yourRate - avgMarketRate} above market avg`
            }
            trend={positionPct < -10 ? "down" : positionPct > 10 ? "up" : "neutral"}
          />
          <MetricCard
            label="Market Occupancy"
            value="71%"
            sub="+4 pts vs. last month"
            trend="up"
          />
          <MetricCard
            label="Active Inventory"
            value={`${COMP_LISTINGS.length}`}
            sub="listings tracked"
            trend="neutral"
          />
        </div>

        {/* Charts row */}
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Rate distribution chart */}
          <div className="lg:col-span-3 bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Rate Distribution
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nightly rate spread · {rvClass} · San Diego
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-medium">
                Your rate: ${yourRate}
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={RATE_DISTRIBUTION}
                margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                barSize={40}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 240)" vertical={false} />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.96 0.005 240)" }} />
                <ReferenceLine
                  x="$200–249"
                  stroke="#2dd4bf"
                  strokeDasharray="4 3"
                  label={{ value: "You", position: "top", fontSize: 11, fill: "#2dd4bf" }}
                />
                <Bar dataKey="count" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Occupancy snapshot */}
          <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              Top Performers by Occupancy
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
              Est. occupancy · last 30 days
            </p>
            <div className="space-y-4">
              {COMP_LISTINGS.sort((a, b) => b.occupancy_est - a.occupancy_est)
                .slice(0, 6)
                .map((l) => (
                  <div key={l.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-foreground truncate max-w-[70%]">
                        {l.rv_year} {l.rv_make} {l.rv_model}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        ${l.nightly_rate}/night
                      </span>
                    </div>
                    <OccupancyBar pct={l.occupancy_est} />
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Comp listings table */}
        <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Comp Listings
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                All {rvClass} rentals tracked in San Diego
              </p>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Data last updated: Apr 19, 2026 · 6:00 AM PDT
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-6 py-3">
                    RV
                  </th>
                  <th className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    Platform
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    Nightly
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    Weekly
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    Reviews
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    Rating
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 hidden md:table-cell">
                    Occ. Est.
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMP_LISTINGS.sort((a, b) => b.nightly_rate - a.nightly_rate).map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-medium text-foreground">
                        {l.rv_year} {l.rv_make} {l.rv_model}
                      </div>
                      <div className="text-xs text-muted-foreground">{l.host}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        variant={l.platform === "outdoorsy" ? "default" : "secondary"}
                        className="text-xs capitalize"
                      >
                        {l.platform}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                      ${l.nightly_rate}
                    </td>
                    <td className="px-4 py-3.5 text-right text-muted-foreground">
                      {l.weekly_rate ? `$${l.weekly_rate}` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-muted-foreground">
                      {l.review_count}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-foreground font-medium">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {l.avg_rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <OccupancyBar pct={l.occupancy_est} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <a
                        href={l.listing_url}
                        className="text-primary hover:text-primary/80 transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
