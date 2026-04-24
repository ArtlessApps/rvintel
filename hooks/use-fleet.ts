"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LookupListing = {
  id: string;
  listing_url: string;
  title: string;
  rv_class: string;
  nightly_rate: number;
  primary_image_url: string | null;
  location_city: string | null;
  location_state: string | null;
  sleeps: number | null;
  length_ft: number | null;
  delivery: boolean | null;
  instant_book: boolean | null;
  market: string;
  scraped_at: string;
};

export type LookupComp = {
  market_median: number;
  sample_freshness: string;
  delta_pct: number;
  position_label: "Above Market" | "At Market" | "Below Market";
};

export type FleetEntryStatus =
  | "pending"
  | "loading"
  | "found"
  | "not_found"
  | "error";

export type FleetEntry = {
  id: string;
  listing_url: string;
  nickname?: string;
  added_at: string;
  listing?: LookupListing;
  comp?: LookupComp | null;
  status: FleetEntryStatus;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return raw.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

// ─── Module store ─────────────────────────────────────────────────────────────
// A single module-level store keeps multiple useFleet() consumers (sidebar +
// detail page) in sync without requiring a React Context provider. Writes
// publish to localStorage and fan-out to every subscribed hook instance.

const FLEET_KEY = "rvintel_fleet";
const SESSION_KEY = "rvintel_fleet_session";

type Listener = (entries: FleetEntry[]) => void;

let memFleet: FleetEntry[] = [];
let memSession: string = "";
let initialized = false;
const listeners = new Set<Listener>();

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  memSession = sid;

  const saved = localStorage.getItem(FLEET_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) memFleet = parsed as FleetEntry[];
    } catch {
      memFleet = [];
    }
  }
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLEET_KEY, JSON.stringify(memFleet));
}

function setFleet(next: FleetEntry[]) {
  memFleet = next;
  persist();
  for (const l of listeners) l(memFleet);
}

function patchEntry(id: string, patch: Partial<FleetEntry>) {
  setFleet(memFleet.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

async function lookup(url: string) {
  const res = await fetch("/api/fleet/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, session_id: memSession }),
  });
  if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
  return res.json();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseFleet = {
  /** Full fleet list, sorted newest-first. Same order as persisted. */
  fleet: FleetEntry[];
  /** True once localStorage has been read on the client. Useful to gate
   *  rendering that depends on the real list (vs. the SSR-empty placeholder). */
  initialized: boolean;
  /** Add a listing by URL. Throws with a user-facing message on validation
   *  failure. Returns the new entry id on success. */
  add: (rawUrl: string) => Promise<string>;
  /** Remove an entry by id. */
  remove: (id: string) => void;
  /** Retry a failed/not-found lookup. */
  retry: (id: string) => Promise<void>;
  /** Current session id (stable across reloads). */
  sessionId: string;
};

export function useFleet(): UseFleet {
  const [fleet, setLocalFleet] = useState<FleetEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureInitialized();
    setLocalFleet(memFleet);
    setReady(true);
    const l: Listener = (next) => setLocalFleet(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const add = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error("Please paste a listing URL.");
    }
    if (
      !trimmed.includes("outdoorsy.com") &&
      !trimmed.includes("rvshare.com")
    ) {
      throw new Error("Please paste an Outdoorsy or RVshare listing URL.");
    }
    const norm = normalizeUrl(trimmed);
    if (memFleet.some((e) => normalizeUrl(e.listing_url) === norm)) {
      throw new Error("This listing is already in your fleet.");
    }

    const entry: FleetEntry = {
      id: crypto.randomUUID(),
      listing_url: trimmed,
      added_at: new Date().toISOString(),
      status: "loading",
    };
    setFleet([entry, ...memFleet]);

    try {
      const data = await lookup(trimmed);
      patchEntry(entry.id, {
        status: data.found ? "found" : "not_found",
        listing: data.listing,
        comp: data.comp ?? null,
      });
    } catch {
      patchEntry(entry.id, { status: "error" });
    }
    return entry.id;
  }, []);

  const remove = useCallback((id: string) => {
    setFleet(memFleet.filter((e) => e.id !== id));
  }, []);

  const retry = useCallback(async (id: string) => {
    const entry = memFleet.find((e) => e.id === id);
    if (!entry) return;
    patchEntry(id, { status: "loading" });
    try {
      const data = await lookup(entry.listing_url);
      patchEntry(id, {
        status: data.found ? "found" : "not_found",
        listing: data.listing,
        comp: data.comp ?? null,
      });
    } catch {
      patchEntry(id, { status: "error" });
    }
  }, []);

  return { fleet, initialized: ready, add, remove, retry, sessionId: memSession };
}
