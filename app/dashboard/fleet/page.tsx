"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Truck,
  ExternalLink,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarketView } from "@/components/market-view";
import { useFleet, type FleetEntry } from "@/hooks/use-fleet";

function formatFreshness(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function YourPositionPanel({ entry }: { entry: FleetEntry }) {
  const listing = entry.listing!;
  const comp = entry.comp ?? null;
  const delta = comp?.delta_pct ?? null;
  const deltaColor =
    delta === null
      ? "text-muted-foreground"
      : delta < -5
        ? "text-amber-500"
        : delta > 5
          ? "text-primary"
          : "text-muted-foreground";

  const positionBadge =
    comp?.position_label === "Below Market" ? (
      <Badge className="bg-amber-500/10 text-amber-600 border-0 text-[11px] px-2 py-0.5">
        Below Market
      </Badge>
    ) : comp?.position_label === "Above Market" ? (
      <Badge className="bg-primary/10 text-primary border-0 text-[11px] px-2 py-0.5">
        Above Market
      </Badge>
    ) : comp ? (
      <Badge className="bg-muted text-muted-foreground border-0 text-[11px] px-2 py-0.5">
        At Market
      </Badge>
    ) : null;

  return (
    <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] overflow-hidden">
      <div className="p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your Position
          </p>
          {positionBadge}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
        <div className="px-6 pt-1 pb-6 sm:py-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Your Price
          </p>
          <p className="text-3xl font-bold tracking-tight text-foreground">
            ${listing.nightly_rate}
            <span className="text-sm font-normal text-muted-foreground">/nt</span>
          </p>
        </div>

        <div className="px-6 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Market Median
          </p>
          {comp ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-3xl font-bold tracking-tight text-foreground cursor-default">
                  ${comp.market_median}
                  <span className="text-sm font-normal text-muted-foreground">
                    /nt
                  </span>
                </p>
              </TooltipTrigger>
              <TooltipContent>
                Data from {formatFreshness(comp.sample_freshness)}
              </TooltipContent>
            </Tooltip>
          ) : (
            <p className="text-xl font-semibold text-muted-foreground">
              No comp set yet
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {listing.rv_class} · comp-set median
          </p>
        </div>

        <div className="px-6 pt-6 pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Delta vs. Market
          </p>
          <p className={`text-3xl font-bold tracking-tight ${deltaColor}`}>
            {delta !== null
              ? `${delta > 0 ? "+" : ""}${delta}%`
              : "—"}
          </p>
          {delta !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              {delta < -5
                ? "Room to raise your nightly rate"
                : delta > 5
                  ? "Priced above the class median"
                  : "Roughly aligned with the market"}
            </p>
          )}
          {!comp && (
            <p className="text-xs text-muted-foreground mt-1">
              No Outdoorsy snapshot for this market + class yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  entry,
  onRemove,
}: {
  entry: FleetEntry;
  onRemove: () => void;
}) {
  const listing = entry.listing;
  if (!listing) return null;
  const location = [listing.location_city, listing.location_state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex items-start gap-4">
      {listing.primary_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.primary_image_url}
          alt={listing.title}
          className="w-16 h-16 rounded object-cover shrink-0 bg-muted"
        />
      ) : (
        <div className="w-16 h-16 rounded bg-muted shrink-0 flex items-center justify-center">
          <Truck className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
          {listing.title}
        </h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 h-4">
            {listing.rv_class}
          </Badge>
          {location && <span>{location}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a
            href={listing.listing_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View listing
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-rose-500"
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Truck className="w-7 h-7 text-muted-foreground/60" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-base font-semibold text-foreground">
          No listings tracked
        </h3>
        <p className="text-sm text-muted-foreground">
          Add your first RV from the sidebar to see exactly how you&apos;re priced
          against your market and class.
        </p>
      </div>
    </div>
  );
}

function NoSelectionState({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Truck className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-semibold text-foreground">
          Select a vehicle
        </h3>
        <p className="text-sm text-muted-foreground">
          Pick one of your {count} tracked RV{count === 1 ? "" : "s"} from the
          left to see its market and positioning.
        </p>
      </div>
    </div>
  );
}

function StatusCard({
  entry,
  onRetry,
  onRemove,
}: {
  entry: FleetEntry;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (entry.status === "loading" || entry.status === "pending") {
    return (
      <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] p-6 space-y-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Looking up this listing…</span>
        </div>
        <Skeleton className="h-20 w-full rounded" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 rounded" />
          <Skeleton className="h-20 rounded" />
          <Skeleton className="h-20 rounded" />
        </div>
      </div>
    );
  }

  if (entry.status === "not_found") {
    return (
      <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Listing not found
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              We don&apos;t have data for this listing yet. It may be in a market
              we don&apos;t currently cover.
            </p>
            <p className="text-xs text-muted-foreground/80 mt-2 break-all">
              {entry.listing_url}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-rose-500"
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="bg-card rounded-xl shadow-[0_1px_4px_rgba(25,28,30,0.06)] p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Couldn&apos;t fetch comp data
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Something went wrong looking up this listing. Try again in a moment.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-2 break-all">
            {entry.listing_url}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-rose-500"
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function FleetDetail() {
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  const { fleet, initialized, remove, retry } = useFleet();

  if (!initialized) {
    return (
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-16 w-full rounded" />
        <Skeleton className="h-32 w-full rounded" />
        <Skeleton className="h-96 w-full rounded" />
      </main>
    );
  }

  if (fleet.length === 0) {
    return (
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EmptyState />
      </main>
    );
  }

  const selected = activeId
    ? fleet.find((e) => e.id === activeId) ?? null
    : null;

  if (!selected) {
    return (
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NoSelectionState count={fleet.length} />
      </main>
    );
  }

  const handleRemove = () => {
    if (!confirm("Remove this listing from your fleet?")) return;
    remove(selected.id);
  };

  if (selected.status !== "found" || !selected.listing) {
    return (
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <StatusCard
          entry={selected}
          onRetry={() => retry(selected.id)}
          onRemove={handleRemove}
        />
      </main>
    );
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <DetailHeader entry={selected} onRemove={handleRemove} />

      <YourPositionPanel entry={selected} />

      <MarketView
        market={selected.listing.market}
        rvClass={selected.listing.rv_class}
        highlightListingId={selected.listing.id}
      />
    </main>
  );
}

export default function FleetPage() {
  return (
    <Suspense fallback={
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-16 w-full rounded" />
        <Skeleton className="h-32 w-full rounded" />
        <Skeleton className="h-96 w-full rounded" />
      </main>
    }>
      <FleetDetail />
    </Suspense>
  );
}
