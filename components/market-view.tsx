"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  ExternalLink,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Listing = {
  id: string;
  canonical_vehicle_id: string | null;
  platform: string;
  host_name: string | null;
  rv_year: number | null;
  rv_make: string | null;
  rv_model: string | null;
  nightly_rate: number;
  weekly_rate: number | null;
  review_count: number | null;
  avg_rating: number | null;
  listing_url: string;
  scraped_at: string;
};

// A deduped row represents one physical RV. For cross-platform canonicals it
// merges 2+ listings into a single market data point; for singletons it is a
// pass-through of the underlying listing. Aggregations and the comp table
// render from this shape so the same RV can't contribute twice to any metric.
type DedupedUnit = {
  key: string;
  primary: Listing;
  platforms: string[];
  memberCount: number;
  nightlyRate: number;
  weeklyRate: number | null;
  reviewCount: number | null;
  avgRating: number | null;
  latestScrapedAt: string;
  members: Listing[];
};

type RateHistoryPoint = { date: string; avg: number; count: number };

type DateWindow = "7d" | "30d" | "90d";

type SortKey = "platform" | "nightly" | "weekly" | "reviews" | "rating";
type SortDir = "asc" | "desc";

type SortableColumn = {
  key: SortKey;
  label: string;
  align: "left" | "right";
  defaultDir: SortDir;
};

type StaticColumn = {
  key: null;
  label: string;
  align: "left" | "right";
};

const TABLE_COLUMNS: Array<SortableColumn | StaticColumn> = [
  { key: null, label: "RV", align: "left" },
  { key: "platform", label: "Platform", align: "left", defaultDir: "desc" },
  { key: "nightly", label: "Nightly", align: "right", defaultDir: "desc" },
  { key: "weekly", label: "Weekly", align: "right", defaultDir: "desc" },
  { key: "reviews", label: "Reviews", align: "right", defaultDir: "desc" },
  { key: "rating", label: "Rating", align: "right", defaultDir: "desc" },
  { key: null, label: "", align: "right" },
];

const MARKET_LABELS: Record<string, string> = {
  "san-diego-ca": "San Diego",
  "los-angeles-ca": "Los Angeles",
  "denver-co": "Denver",
  "austin-tx": "Austin",
  "miami-fl": "Miami",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeListings(listings: Listing[]): DedupedUnit[] {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    const key = l.canonical_vehicle_id ?? l.id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(l);
    else groups.set(key, [l]);
  }

  const units: DedupedUnit[] = [];
  for (const [key, members] of groups) {
    if (members.length === 1) {
      const l = members[0];
      units.push({
        key,
        primary: l,
        platforms: [l.platform],
        memberCount: 1,
        nightlyRate: l.nightly_rate,
        weeklyRate: l.weekly_rate,
        reviewCount: l.review_count,
        avgRating: l.avg_rating,
        latestScrapedAt: l.scraped_at,
        members,
      });
      continue;
    }

    // Representative: most-reviewed listing as "most established"; ties broken
    // by most-recent scrape. Deterministic across renders.
    const primary = [...members].sort((a, b) => {
      const ra = a.review_count ?? 0;
      const rb = b.review_count ?? 0;
      if (rb !== ra) return rb - ra;
      return a.scraped_at > b.scraped_at ? -1 : 1;
    })[0];

    const rateSum = members.reduce((s, m) => s + m.nightly_rate, 0);
    const nightlyRate = Math.round(rateSum / members.length);

    const weeklyMembers = members.filter((m) => m.weekly_rate != null);
    const weeklyRate = weeklyMembers.length
      ? Math.round(weeklyMembers.reduce((s, m) => s + (m.weekly_rate ?? 0), 0) / weeklyMembers.length)
      : null;

    const reviewCount = members.reduce((s, m) => s + (m.review_count ?? 0), 0) || null;

    const ratingMembers = members.filter((m) => m.avg_rating != null);
    const avgRating = ratingMembers.length
      ? ratingMembers.reduce((s, m) => s + (m.avg_rating ?? 0), 0) / ratingMembers.length
      : null;

    const latestScrapedAt = members.reduce(
      (acc, m) => (m.scraped_at > acc ? m.scraped_at : acc),
      members[0].scraped_at,
    );

    const platforms = Array.from(new Set(members.map((m) => m.platform))).sort();

    units.push({
      key,
      primary,
      platforms,
      memberCount: members.length,
      nightlyRate,
      weeklyRate,
      reviewCount,
      avgRating,
      latestScrapedAt,
      members,
    });
  }

  units.sort((a, b) => b.nightlyRate - a.nightlyRate);
  return units;
}

function buildRateDistribution(units: DedupedUnit[]) {
  const buckets: Record<string, number> = {};
  for (const u of units) {
    const base = Math.floor(u.nightlyRate / 50) * 50;
    const key = `$${base}–${base + 49}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))
    .map(([range, count]) => ({ range, count }));
}

// Intentionally coarse. Exposing an exact "last updated" timestamp would let
// upstream rental platforms reverse-engineer our refresh cadence and time
// anti-bot rules around it. Bucket the freshness so users still get a sense
// of recency without leaking the schedule.
function formatLastUpdated(units: DedupedUnit[]) {
  if (!units.length) return "—";
  const latestMs = units.reduce((acc, u) => {
    const t = new Date(u.latestScrapedAt).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  if (!latestMs) return "—";
  const ageMs = Date.now() - latestMs;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < day) return "within the last 24 hours";
  if (ageMs < 7 * day) return "within the past week";
  if (ageMs < 30 * day) return "within the past month";
  return "over a month ago";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, trend,
}: {
  label: string; value: string; sub: string; trend: "up" | "down" | "neutral";
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{label}</p>
      <p className="text-3xl font-bold text-foreground tracking-tight mb-1">{value}</p>
      <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
        <TrendIcon className="w-3.5 h-3.5" />
        <span>{sub}</span>
      </div>
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">{payload[0].value} listing{payload[0].value !== 1 ? "s" : ""}</p>
      </div>
    );
  }
  return null;
};

const RateHistoryTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: RateHistoryPoint }[]; label?: string }) => {
  if (active && payload?.length) {
    const p = payload[0].payload;
    const d = new Date(label ?? "");
    const dateLabel = isNaN(d.getTime())
      ? label
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md text-sm">
        <p className="font-semibold text-foreground">{dateLabel}</p>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">${p.avg}</span> avg · {p.count} snapshot{p.count !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export type MarketViewProps = {
  market: string;
  rvClass: string;
  /** Controlled date window. Either provide both dateWindow+onDateWindowChange, or neither (defaults to an internal "30d"). */
  dateWindow?: DateWindow;
  onDateWindowChange?: (w: DateWindow) => void;
  /** When true, MarketView renders its own compact date-window selector inside the rate-over-time card. Defaults to true when uncontrolled, false when controlled. */
  showInlineWindowSelector?: boolean;
  /** When provided, matching rows in the comp table get a primary-tinted background + "Your RV" badge. */
  highlightListingId?: string;
  /** Any value change triggers a re-fetch of listings + rate history. */
  refreshToken?: unknown;
};

export function MarketView({
  market,
  rvClass,
  dateWindow: dateWindowProp,
  onDateWindowChange,
  showInlineWindowSelector,
  highlightListingId,
  refreshToken,
}: MarketViewProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalDateWindow, setInternalDateWindow] = useState<DateWindow>("30d");
  const isControlled = dateWindowProp !== undefined;
  const dateWindow = isControlled ? dateWindowProp! : internalDateWindow;
  const setDateWindow = (w: DateWindow) => {
    if (isControlled) onDateWindowChange?.(w);
    else setInternalDateWindow(w);
  };
  const inlineSelector = showInlineWindowSelector ?? !isControlled;
  const [rateHistory, setRateHistory] = useState<RateHistoryPoint[]>([]);
  const [rateHistoryLoading, setRateHistoryLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "nightly",
    dir: "desc",
  });

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getSupabase()
        .from("listings")
        .select("id, canonical_vehicle_id, platform, host_name, rv_year, rv_make, rv_model, nightly_rate, weekly_rate, review_count, avg_rating, listing_url, scraped_at")
        .eq("market", market)
        .eq("rv_class", rvClass)
        .eq("is_active", true)
        .order("nightly_rate", { ascending: false });

      setListings(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [market, rvClass]);

  useEffect(() => { fetchListings(); }, [fetchListings, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    setRateHistoryLoading(true);
    const params = new URLSearchParams({ market, rv_class: rvClass, window: dateWindow });
    fetch(`/api/rate-history?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setRateHistory(Array.isArray(json?.data) ? json.data : []);
      })
      .catch(() => {
        if (!cancelled) setRateHistory([]);
      })
      .finally(() => {
        if (!cancelled) setRateHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [market, rvClass, dateWindow, refreshToken]);

  // Collapse cross-platform duplicates into one row per canonical vehicle.
  // Every downstream aggregate (metric cards, histogram, table) renders from
  // this deduped array so the same physical RV never contributes twice.
  // NOTE: /api/rate-history is not yet canonical-aware — the time-series
  // chart still reflects raw listing_snapshots. Flagged for a follow-up.
  const units = useMemo(() => dedupeListings(listings), [listings]);

  const sortedUnits = useMemo(() => {
    const arr = [...units];
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;

    const getValue = (u: DedupedUnit): number | null => {
      switch (key) {
        case "platform":
          return u.memberCount;
        case "nightly":
          return u.nightlyRate;
        case "weekly":
          return u.weeklyRate;
        case "reviews":
          return u.reviewCount;
        case "rating":
          return u.avgRating;
      }
    };

    arr.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av == null && bv == null) return a.key < b.key ? -1 : 1;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return a.key < b.key ? -1 : 1;
    });
    return arr;
  }, [units, sort]);

  const toggleSort = (key: SortKey, defaultDir: SortDir) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir },
    );
  };

  const avgRate = units.length
    ? Math.round(units.reduce((s, u) => s + u.nightlyRate, 0) / units.length)
    : 0;

  const rateDistribution = buildRateDistribution(units);
  const lastUpdated = formatLastUpdated(units);
  const marketLabel = MARKET_LABELS[market] ?? market;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const freshCount = units.filter(
    (u) => new Date(u.latestScrapedAt).getTime() > sevenDaysAgo
  ).length;
  const freshPct = units.length
    ? Math.round((freshCount / units.length) * 100)
    : 0;

  const highlightKeys = useMemo(() => {
    if (!highlightListingId) return new Set<string>();
    const set = new Set<string>();
    for (const u of units) {
      if (u.members.some((m) => m.id === highlightListingId)) {
        set.add(u.key);
      }
    }
    return set;
  }, [units, highlightListingId]);

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              label="Avg Market Rate"
              value={avgRate ? `$${avgRate}/night` : "—"}
              sub={`across ${units.length} unique RV${units.length === 1 ? "" : "s"}`}
              trend="neutral"
            />
            <MetricCard
              label="Rate Range"
              value={units.length ? `$${Math.min(...units.map(u => u.nightlyRate))}–$${Math.max(...units.map(u => u.nightlyRate))}` : "—"}
              sub="min to max nightly"
              trend="neutral"
            />
            <MetricCard
              label="Avg Rating"
              value={units.filter(u => u.avgRating).length
                ? `${(units.reduce((s, u) => s + (u.avgRating ?? 0), 0) / units.filter(u => u.avgRating).length).toFixed(2)} ★`
                : "—"}
              sub={`across ${units.filter(u => u.avgRating).length} rated RV${units.filter(u => u.avgRating).length === 1 ? "" : "s"}`}
              trend="up"
            />
            <MetricCard
              label="Priced in Last 7d"
              value={`${freshCount}`}
              sub={units.length ? `${freshPct}% of ${units.length} active` : "no data yet"}
              trend="neutral"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Rate distribution */}
        <div className="lg:col-span-3 bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Rate Distribution</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Nightly rate spread · {rvClass} · {marketLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              {avgRate > 0 && (
                <Badge variant="outline" className="text-xs font-medium">Avg: ${avgRate}/night</Badge>
              )}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : rateDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rateDistribution} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 240)" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.96 0.005 240)" }} />
                <Bar dataKey="count" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              No data for this market + class combination yet.
            </div>
          )}
        </div>

        {/* Avg rate over time */}
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-[0_1px_4px_rgba(25,28,30,0.06)]">
          <div className="flex items-start justify-between mb-6 gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Avg Rate Over Time</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daily mean nightly rate · {dateWindow === "7d" ? "last 7 days" : dateWindow === "90d" ? "last 90 days" : "last 30 days"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {inlineSelector && (
                <Select value={dateWindow} onValueChange={(v) => setDateWindow(v as DateWindow)}>
                  <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {rateHistory.length > 1 && (() => {
                const first = rateHistory[0].avg;
                const last = rateHistory[rateHistory.length - 1].avg;
                const delta = last - first;
                const pct = first ? Math.round((delta / first) * 100) : 0;
                const sign = delta > 0 ? "+" : "";
                return (
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-500" : ""}`}
                  >
                    {sign}{pct}% vs start
                  </Badge>
                );
              })()}
            </div>
          </div>
          {rateHistoryLoading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : rateHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={rateHistory} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateHistoryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 240)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(d: string) => {
                    const date = new Date(d);
                    return isNaN(date.getTime())
                      ? d
                      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.01 240)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<RateHistoryTooltip />} cursor={{ stroke: "oklch(0.85 0.01 240)", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="#2dd4bf"
                  strokeWidth={2}
                  fill="url(#rateHistoryFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#2dd4bf" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-center text-sm text-muted-foreground px-6">
              No snapshots in this window yet. History builds up as data refreshes.
            </div>
          )}
        </div>
      </div>

      {/* Comp listings table */}
      <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Comp Listings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All {rvClass} rentals tracked in {marketLabel}
              {!loading && units.length > 0 && (
                <> · {units.length} unique RV{units.length === 1 ? "" : "s"}</>
              )}
            </p>
          </div>
          {!loading && listings.length > 0 && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              Refreshed {lastUpdated}
            </p>
          )}
        </div>
        <div className="overflow-auto max-h-[640px]">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : units.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No listings tracked for this market yet.{" "}
              <button
                onClick={() => fetchListings()}
                className="text-primary hover:underline"
              >
                Refresh now
              </button>{" "}
              to populate data.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {TABLE_COLUMNS.map((col, i) => {
                    const alignClass =
                      col.align === "left"
                        ? i === 0
                          ? "text-left pl-6"
                          : "text-left"
                        : "text-right";
                    const baseClass = `sticky top-0 z-10 bg-muted text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 ${alignClass}`;

                    if (col.key === null) {
                      return (
                        <th key={`static-${i}`} className={baseClass}>
                          {col.label}
                        </th>
                      );
                    }

                    const isActive = sort.key === col.key;
                    const Chev = isActive
                      ? sort.dir === "asc"
                        ? ChevronUp
                        : ChevronDown
                      : null;

                    return (
                      <th key={col.key} className={baseClass} aria-sort={isActive ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key, col.defaultDir)}
                          className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${
                            col.align === "right" ? "w-full justify-end" : ""
                          } ${isActive ? "text-foreground" : ""}`}
                        >
                          <span>{col.label}</span>
                          {Chev && <Chev className="w-3 h-3" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedUnits.map((u) => {
                  const l = u.primary;
                  const crossListed = u.memberCount > 1;
                  const isHighlight = highlightKeys.has(u.key);
                  return (
                    <tr
                      key={u.key}
                      className={`transition-colors ${
                        isHighlight
                          ? "bg-primary/10 hover:bg-primary/15"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          <span>{[l.rv_year, l.rv_make, l.rv_model].filter(Boolean).join(" ") || "Unknown RV"}</span>
                          {isHighlight && (
                            <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-semibold px-1.5 py-0 h-4">
                              Your RV
                            </Badge>
                          )}
                          {crossListed && (
                            <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 h-4">
                              ×{u.memberCount} cross-listed
                            </Badge>
                          )}
                        </div>
                        {l.host_name && (
                          <div className="text-xs text-muted-foreground">{l.host_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {u.platforms.map((p) => (
                            <Badge
                              key={p}
                              variant={p === "outdoorsy" ? "default" : "secondary"}
                              className="text-xs capitalize"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                        ${u.nightlyRate}
                        {crossListed && (
                          <div className="text-[10px] font-normal text-muted-foreground">
                            avg of {u.memberCount}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-muted-foreground">
                        {u.weeklyRate ? `$${u.weeklyRate}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right text-muted-foreground">{u.reviewCount ?? "—"}</td>
                      <td className="px-4 py-3.5 text-right">
                        {u.avgRating ? (
                          <span className="inline-flex items-center gap-1 text-foreground font-medium">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {u.avgRating.toFixed(1)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {crossListed ? (
                          <div className="flex items-center justify-end gap-1">
                            {u.members.map((m) => (
                              <a
                                key={m.id}
                                href={m.listing_url}
                                title={`${m.platform} · $${m.nightly_rate}/night`}
                                className="text-primary hover:text-primary/80 transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <a href={l.listing_url} className="text-primary hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
