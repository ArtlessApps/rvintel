"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  Truck,
  Plus,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleet, type FleetEntry } from "@/hooks/use-fleet";

function deltaDotClass(entry: FleetEntry): string {
  const d = entry.comp?.delta_pct;
  if (d == null) return "bg-muted-foreground/30";
  if (d < -5) return "bg-amber-500";
  if (d > 5) return "bg-primary";
  return "bg-muted-foreground/40";
}

function entryLabel(entry: FleetEntry): string {
  if (entry.nickname) return entry.nickname;
  if (entry.listing?.title) return entry.listing.title;
  try {
    const u = new URL(entry.listing_url);
    return u.hostname.replace("www.", "");
  } catch {
    return entry.listing_url;
  }
}

export default function FleetSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  const { fleet, initialized, add, remove, retry } = useFleet();

  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = async () => {
    setAddError(null);
    setAdding(true);
    try {
      const newId = await add(addUrl);
      setAddUrl("");
      setShowAdd(false);
      router.push(`/dashboard/fleet?id=${newId}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add listing.");
    } finally {
      setAdding(false);
    }
  };

  const handleSelect = (id: string) => {
    router.push(`/dashboard/fleet?id=${id}`);
  };

  const handleRemove = (id: string) => {
    if (!confirm("Remove this listing from your fleet?")) return;
    remove(id);
    if (activeId === id) {
      router.push("/dashboard/fleet");
    }
  };

  return (
    <aside className="w-72 shrink-0 bg-muted/60 sticky top-0 h-screen flex flex-col overflow-hidden">
      {/* Brand + back link */}
      <div className="px-4 pt-5 pb-3">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <Link
          href="/dashboard"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Market Dashboard
        </Link>
      </div>

      {/* Section header */}
      <div className="px-4 pt-2 pb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            My Fleet
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {initialized ? `${fleet.length} tracked` : "Loading…"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1 text-primary hover:text-primary hover:bg-primary/10"
          onClick={() => {
            setShowAdd((v) => !v);
            setAddError(null);
          }}
          disabled={adding}
          aria-label="Add listing"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* Add listing inline form */}
      {showAdd && (
        <div className="px-4 pb-3 space-y-2">
          <Input
            type="url"
            placeholder="Paste Outdoorsy or RVshare URL"
            value={addUrl}
            onChange={(e) => {
              setAddUrl(e.target.value);
              setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !adding) handleAdd();
              if (e.key === "Escape") {
                setShowAdd(false);
                setAddUrl("");
                setAddError(null);
              }
            }}
            className="h-8 text-xs"
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleAdd}
              disabled={adding || !addUrl.trim()}
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setShowAdd(false);
                setAddUrl("");
                setAddError(null);
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          {addError && (
            <p className="text-[11px] text-amber-600 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{addError}</span>
            </p>
          )}
        </div>
      )}

      {/* Vehicle list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {!initialized ? (
          <div className="px-2 py-2 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : fleet.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <Truck className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <p className="text-xs text-muted-foreground">No vehicles yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Click Add to paste a listing URL.
            </p>
          </div>
        ) : (
          fleet.map((entry) => {
            const active = entry.id === activeId;
            const label = entryLabel(entry);
            const subtitle = entry.listing
              ? [entry.listing.rv_class, entry.listing.location_city]
                  .filter(Boolean)
                  .join(" · ")
              : null;

            const isDone = entry.status === "found";
            const isLoading = entry.status === "loading";

            return (
              <div
                key={entry.id}
                className={`group relative rounded overflow-hidden transition-colors ${
                  active
                    ? "bg-primary/10"
                    : "hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(entry.id)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left disabled:opacity-70"
                >
                  {/* Thumbnail / icon */}
                  {entry.listing?.primary_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.listing.primary_image_url}
                      alt=""
                      className="w-9 h-9 rounded object-cover shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-muted shrink-0 flex items-center justify-center">
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                      ) : entry.status === "error" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      ) : entry.status === "not_found" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  )}

                  {/* Label + subtitle */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isDone && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${deltaDotClass(
                            entry,
                          )}`}
                          aria-hidden
                        />
                      )}
                      <div
                        className={`text-xs font-medium truncate ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {label}
                      </div>
                    </div>
                    {subtitle && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {subtitle}
                      </div>
                    )}
                    {entry.status === "error" && (
                      <div className="text-[11px] text-rose-500">
                        Error — retry
                      </div>
                    )}
                    {entry.status === "not_found" && (
                      <div className="text-[11px] text-amber-600">
                        Not in our database
                      </div>
                    )}
                  </div>
                </button>

                {/* Hover actions */}
                <div
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity ${
                    active
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  }`}
                >
                  {(entry.status === "error" || entry.status === "not_found") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retry(entry.id);
                      }}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                      title="Retry"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(entry.id);
                    }}
                    className="p-1 rounded hover:bg-background text-muted-foreground hover:text-rose-500"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
