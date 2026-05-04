#!/usr/bin/env python3
"""Outdoorsy fleet-host lead generator (v2 — direct JSON:API rewrite).

Replaces the v1 Firecrawl HTML-scrape path (4 stages, ~250 credits/run, ~120
listing cap) with two zero-cost JSON:API endpoints that the Outdoorsy web app
itself consumes:

  1. search.outdoorsy.com/rentals — paginated rental list with full
     relationships.owner.data.id on every result. One sweep per RV class code
     (a / b / c / trailer / fifth-wheel) covers the ENTIRE market universe;
     we group rentals by owner_id and keep owners with ≥ MIN_LISTINGS rentals
     in the target market.

  2. api.outdoorsy.com/v0/users/<owner_id> — public host profile JSON. Returns
     business.name, business.website, business.phone, profile.first/last_name,
     host_type_by_rental_count (SingleListingHost / MultiListingHost), dealer,
     is_superhost, owner_score, average_response_time, avatar_url. Same source
     the www.outdoorsy.com/pro/<id> HTML page is hydrated from — no scraping.

The v1 Firecrawl path is gone. If api.outdoorsy.com is ever locked down, the
search-endpoint sweep alone still produces a usable lead list (owner_id +
listing count + listing URLs); only the contact-detail enrichment step would
need to fall back. An optional --firecrawl-fallback flag is wired for that
case (off by default — typically not needed).

Investigated and validated 2026-04-27 against San Diego:
  - SD universe across all 5 classes: ~1,000+ rentals (vs v1's 120-listing cap)
  - business.{name, website, phone} fill rate on multi-listing hosts: ~80%
  - Zero Firecrawl credits; ~5 sec for the search sweep, ~15 sec for ~50
    fleet-host profile lookups → full SD lead run < 30 sec.

Usage:
  python scripts/outdoorsy_leads.py
  python scripts/outdoorsy_leads.py --address "Phoenix, AZ" --market phoenix-az
  python scripts/outdoorsy_leads.py --min-listings 3
  python scripts/outdoorsy_leads.py --firecrawl-fallback  # search Google for missing websites
  python scripts/outdoorsy_leads.py --output leads_sd.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional

# ── Config ────────────────────────────────────────────────────────────────────
SEARCH_BASE = "https://search.outdoorsy.com/rentals"
USER_BASE = "https://api.outdoorsy.com/v0/users"
PROFILE_URL_TEMPLATE = "https://www.outdoorsy.com/pro/{id}"

# Backend filter codes — see PRD §11 (2026-04-22) for the `tt` → `trailer`
# bug that masked SD travel trailers for months. These are the ONLY values
# the search.outdoorsy.com backend recognizes.
CLASS_CODES = ["a", "b", "c", "trailer", "fifth-wheel"]
PAGE_SIZE = 24
MAX_PAGES_PER_CLASS = 60  # safety cap; SD's largest class is ~14 pages
PAGE_DELAY_SEC = 0.25
USER_DELAY_SEC = 0.4
HTTP_TIMEOUT_SEC = 15

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/vnd.api+json, application/json",
    "Origin": "https://www.outdoorsy.com",
    "Referer": "https://www.outdoorsy.com/",
}

CSV_COLUMNS = [
    "Owner ID",
    "Host Name",
    "Business Name",
    "Host Type",          # SingleListingHost | MultiListingHost
    "Dealer",             # true/false — Outdoorsy's own dealer flag
    "Pro",                # true/false — Outdoorsy Pro program
    "Superhost",
    "Listing Count",      # local to the searched market
    "RV Classes",
    "Total Reviews",
    "Owner Score",        # 0-5
    "Owner Score Count",
    "Accept %",
    "Response Time (hrs)",
    "Profile URL",
    "Website",
    "Phone",
    "Email",              # only filled if --firecrawl-fallback or visible in bio
    "Social Media",
    "Avatar URL",
    "Bio Excerpt",
    "Sample Listing URL",
    "Market",
    "Scraped At",
]


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _http_get_json(url: str, *, timeout: int = HTTP_TIMEOUT_SEC) -> Optional[dict]:
    req = urllib.request.Request(url, headers=REQUEST_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        return json.loads(data.decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  [http {e.code}] {url}: {e.reason}", file=sys.stderr)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  [err] {url}: {e}", file=sys.stderr)
        return None


# ── Stage 1: search.outdoorsy.com sweep ───────────────────────────────────────

@dataclass
class RentalSummary:
    rental_id: str
    listing_url: str
    display_vehicle_type: Optional[str]
    review_count: int
    avg_rating: Optional[float]


@dataclass
class FleetCandidate:
    owner_id: str
    rentals: list[RentalSummary] = field(default_factory=list)

    @property
    def listing_count(self) -> int:
        return len(self.rentals)

    @property
    def total_reviews(self) -> int:
        return sum(r.review_count for r in self.rentals)

    @property
    def rv_classes(self) -> list[str]:
        return sorted({r.display_vehicle_type for r in self.rentals if r.display_vehicle_type})

    @property
    def sample_listing_url(self) -> str:
        # Prefer the most-reviewed listing — it's the one a prospect is most
        # likely to recognize when we cite it in outreach.
        if not self.rentals:
            return ""
        top = max(self.rentals, key=lambda r: (r.review_count, r.avg_rating or 0))
        return top.listing_url


def _build_search_url(address: str, class_code: str, offset: int) -> str:
    params = {
        "address": address,
        "filter[type]": class_code,
        "page[limit]": PAGE_SIZE,
        "page[offset]": offset,
    }
    # Encode without escaping the brackets — Outdoorsy's backend accepts both
    # but the canonical form on the wire uses literal [ and ].
    return f"{SEARCH_BASE}?{urllib.parse.urlencode(params, safe='[]')}"


def _normalize_rental(raw: dict) -> Optional[RentalSummary]:
    a = raw.get("attributes") or {}
    slug = a.get("slug") if isinstance(a.get("slug"), str) else None
    listing_url = (
        f"https://www.outdoorsy.com{slug}" if slug
        else f"https://www.outdoorsy.com/rv-rental/listing/{raw.get('id')}"
    )

    avg_rating: Optional[float] = None
    avg_reviews = a.get("average_reviews") or {}
    rental_block = avg_reviews.get("rental") if isinstance(avg_reviews, dict) else None
    if isinstance(rental_block, list) and rental_block:
        score = (rental_block[0] or {}).get("score")
        if isinstance(score, (int, float)):
            avg_rating = float(score)

    return RentalSummary(
        rental_id=str(raw.get("id")),
        listing_url=listing_url,
        display_vehicle_type=a.get("display_vehicle_type") if isinstance(a.get("display_vehicle_type"), str) else None,
        review_count=int(a.get("reviews_num") or 0),
        avg_rating=avg_rating,
    )


def sweep_market(address: str) -> dict[str, FleetCandidate]:
    """Return owner_id → FleetCandidate covering the full market universe."""
    by_owner: dict[str, FleetCandidate] = {}
    seen_rentals: set[str] = set()

    for class_code in CLASS_CODES:
        print(f"  class={class_code}")
        class_total: Optional[int] = None
        class_collected = 0

        for page in range(MAX_PAGES_PER_CLASS):
            url = _build_search_url(address, class_code, page * PAGE_SIZE)
            payload = _http_get_json(url)
            if payload is None:
                break

            data = payload.get("data") or []
            meta = payload.get("meta") or {}
            if class_total is None:
                t = meta.get("total")
                class_total = int(t) if isinstance(t, (int, float)) else None

            new_this_page = 0
            for raw in data:
                rid = str(raw.get("id") or "")
                if not rid or rid in seen_rentals:
                    continue
                seen_rentals.add(rid)
                rs = _normalize_rental(raw)
                if rs is None:
                    continue

                owner = (((raw.get("relationships") or {}).get("owner") or {}).get("data") or {})
                owner_id = str(owner.get("id") or "")
                if not owner_id:
                    continue

                cand = by_owner.setdefault(owner_id, FleetCandidate(owner_id=owner_id))
                cand.rentals.append(rs)
                new_this_page += 1
                class_collected += 1

            print(f"    page@{page * PAGE_SIZE}: got {len(data)}, new {new_this_page}, "
                  f"class total {class_collected}/{class_total if class_total is not None else '?'}")

            if len(data) < PAGE_SIZE:
                break
            if class_total is not None and class_collected >= class_total:
                break
            time.sleep(PAGE_DELAY_SEC)

    return by_owner


# ── Stage 2: api.outdoorsy.com user enrichment ────────────────────────────────

@dataclass
class HostProfile:
    owner_id: str
    first_name: str = ""
    last_name: str = ""
    business_name: str = ""
    business_website: str = ""
    business_phone: str = ""
    bio: str = ""
    host_type: str = ""           # SingleListingHost | MultiListingHost
    rental_category: str = ""     # RvHost | StayHost | ...
    dealer: bool = False
    pro: bool = False
    is_superhost: bool = False
    owner_score: Optional[float] = None
    owner_score_count: int = 0
    accept_percent: Optional[float] = None
    response_time_seconds: Optional[float] = None  # average_response_time
    avatar_url: str = ""

    @property
    def host_name(self) -> str:
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.business_name

    @property
    def response_time_hours(self) -> Optional[float]:
        if self.response_time_seconds is None:
            return None
        return round(self.response_time_seconds / 3600, 1)


def fetch_host_profile(owner_id: str) -> Optional[HostProfile]:
    payload = _http_get_json(f"{USER_BASE}/{owner_id}")
    if payload is None:
        return None

    profile = payload.get("profile") or {}
    business = profile.get("business") or {}

    return HostProfile(
        owner_id=str(payload.get("id") or owner_id),
        first_name=(profile.get("first_name") or "").strip(),
        last_name=(profile.get("last_name") or "").strip(),
        business_name=(business.get("name") or "").strip(),
        business_website=(business.get("website") or "").strip(),
        business_phone=(business.get("phone") or "").strip(),
        bio=(business.get("description") or "").strip(),
        host_type=str(payload.get("host_type_by_rental_count") or ""),
        rental_category=str(payload.get("host_type_by_rental_category") or ""),
        dealer=bool(payload.get("dealer")),
        pro=bool(payload.get("pro")),
        is_superhost=bool(payload.get("is_superhost")),
        owner_score=_as_float(payload.get("owner_score")),
        owner_score_count=int(payload.get("owner_score_count") or 0),
        accept_percent=_as_float(payload.get("accept_percent")),
        response_time_seconds=_as_float(payload.get("average_response_time")),
        avatar_url=str(profile.get("avatar_url") or ""),
    )


def _as_float(v: Any) -> Optional[float]:
    if isinstance(v, (int, float)):
        return float(v)
    return None


# ── Bio mining ────────────────────────────────────────────────────────────────

# Hosts often paste their website / Instagram / email directly into the bio.
# Cheap to mine and free of false positives if we anchor on URL/email shape.

URL_RE = re.compile(r"https?://[^\s)\]\"'<>]+", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}")
SOCIAL_DOMAINS = ("instagram.com", "facebook.com", "tiktok.com", "youtube.com", "x.com", "twitter.com")


def mine_bio(profile: HostProfile) -> tuple[str, str, list[str]]:
    """Pull (website, email, social_urls) hints out of the host's bio.

    Bio-mined website is only used if business.website is empty. Email is
    the only realistic source of contact email from the platform — Outdoorsy
    masks owner emails on every other surface.
    """
    if not profile.bio:
        return ("", "", [])

    website = ""
    socials: list[str] = []
    for m in URL_RE.findall(profile.bio):
        clean = m.rstrip(".,);")
        host = urllib.parse.urlparse(clean).netloc.lower().replace("www.", "")
        if any(d in host for d in SOCIAL_DOMAINS):
            socials.append(clean)
        elif not website and "outdoorsy.com" not in host:
            website = clean

    email = ""
    for m in EMAIL_RE.findall(profile.bio):
        if not any(s in m.lower() for s in ("noreply", "example.", "schema.")):
            email = m
            break

    return (website, email, socials[:2])


# ── Optional: Firecrawl fallback for missing websites ─────────────────────────

def _maybe_load_firecrawl():
    try:
        import os
        from firecrawl import FirecrawlApp  # type: ignore
        key = os.environ.get("FIRECRAWL_API_KEY")
        if not key:
            print("  [firecrawl] FIRECRAWL_API_KEY not set — skipping fallback enrichment", file=sys.stderr)
            return None
        return FirecrawlApp(api_key=key)
    except ImportError:
        print("  [firecrawl] firecrawl-py not installed — skipping fallback enrichment", file=sys.stderr)
        return None


def firecrawl_enrich_website(app, host_name: str, market_label: str) -> str:
    """Single Google-style search per host for hosts with no business.website."""
    query = f"{host_name} {market_label} RV rental"
    skip_domains = {
        "outdoorsy.com", "rvshare.com", "hipcamp.com", "yelp.com",
        "tripadvisor.com", "yellowpages.com", "bbb.org", "mapquest.com",
        "local.yahoo.com", "google.com",
    }
    try:
        result = app.search(query, limit=8)
    except Exception as e:
        print(f"  [firecrawl-search] '{host_name}': {e}", file=sys.stderr)
        return ""

    web_results = getattr(result, "web", None) or []
    for item in web_results:
        url = getattr(item, "url", "") or ""
        if not url:
            continue
        domain = urllib.parse.urlparse(url).netloc.lower().replace("www.", "")
        if any(skip in domain for skip in skip_domains):
            continue
        if any(s in domain for s in SOCIAL_DOMAINS):
            continue
        return url.split("?")[0]
    return ""


# ── CSV emission ──────────────────────────────────────────────────────────────

def to_row(cand: FleetCandidate, profile: Optional[HostProfile], *,
           market: str, scraped_at: str,
           extra_website: str = "", extra_email: str = "",
           extra_socials: Optional[list[str]] = None) -> dict[str, Any]:
    row: dict[str, Any] = {col: "" for col in CSV_COLUMNS}
    row["Owner ID"] = cand.owner_id
    row["Listing Count"] = cand.listing_count
    row["Total Reviews"] = cand.total_reviews
    row["RV Classes"] = " | ".join(cand.rv_classes)
    row["Sample Listing URL"] = cand.sample_listing_url
    row["Profile URL"] = PROFILE_URL_TEMPLATE.format(id=cand.owner_id)
    row["Market"] = market
    row["Scraped At"] = scraped_at

    if profile is not None:
        row["Host Name"] = profile.host_name
        row["Business Name"] = profile.business_name
        row["Host Type"] = profile.host_type
        row["Dealer"] = "true" if profile.dealer else "false"
        row["Pro"] = "true" if profile.pro else "false"
        row["Superhost"] = "true" if profile.is_superhost else "false"
        row["Owner Score"] = f"{profile.owner_score:.2f}" if profile.owner_score is not None else ""
        row["Owner Score Count"] = profile.owner_score_count or ""
        row["Accept %"] = f"{int(profile.accept_percent * 100)}" if profile.accept_percent is not None else ""
        row["Response Time (hrs)"] = profile.response_time_hours if profile.response_time_hours is not None else ""
        row["Website"] = profile.business_website or extra_website
        row["Phone"] = profile.business_phone
        row["Email"] = extra_email  # bio-mined or firecrawl-mined
        row["Social Media"] = " | ".join(extra_socials or [])
        row["Avatar URL"] = profile.avatar_url
        row["Bio Excerpt"] = profile.bio[:280].replace("\n", " ").strip()
    return row


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--address", default="San Diego, CA",
                        help="Free-text address for search.outdoorsy.com (default: 'San Diego, CA')")
    parser.add_argument("--market", default=None,
                        help="Market slug to stamp in the CSV (default: derived from --address)")
    parser.add_argument("--min-listings", type=int, default=2,
                        help="Minimum listings in market to qualify as a fleet host (default: 2)")
    parser.add_argument("--output", default=None,
                        help="CSV output path (default: outdoorsy_<market>_leads.csv)")
    parser.add_argument("--firecrawl-fallback", action="store_true",
                        help="Use Firecrawl search to find websites for hosts with no business.website")
    parser.add_argument("--no-bio-mine", action="store_true",
                        help="Skip mining the bio for website/email/social hints")
    args = parser.parse_args()

    market = args.market or _slugify(args.address)
    output = args.output or f"outdoorsy_{market}_leads.csv"

    print("=" * 64)
    print(f"Outdoorsy fleet-host lead generator (v2)")
    print(f"  address       : {args.address}")
    print(f"  market slug   : {market}")
    print(f"  min listings  : {args.min_listings}")
    print(f"  firecrawl     : {'on (fallback)' if args.firecrawl_fallback else 'off'}")
    print(f"  output        : {output}")
    print("=" * 64)

    # ── Stage 1: full-market sweep via search.outdoorsy.com ───────────────────
    t0 = time.time()
    print(f"\n[1/3] Sweeping {len(CLASS_CODES)} class codes from search.outdoorsy.com...")
    by_owner = sweep_market(args.address)
    sweep_secs = time.time() - t0
    total_rentals = sum(c.listing_count for c in by_owner.values())
    print(f"\n  → {len(by_owner)} unique owners across {total_rentals} rentals "
          f"in {sweep_secs:.1f}s")

    fleet_owners = sorted(
        (c for c in by_owner.values() if c.listing_count >= args.min_listings),
        key=lambda c: (-c.listing_count, -c.total_reviews),
    )
    print(f"  → {len(fleet_owners)} owners with ≥{args.min_listings} listings (fleet candidates)")

    # ── Stage 2: enrich via api.outdoorsy.com/v0/users/<id> ───────────────────
    print(f"\n[2/3] Fetching host profiles from api.outdoorsy.com...")
    profiles: dict[str, Optional[HostProfile]] = {}
    bio_mined: dict[str, tuple[str, str, list[str]]] = {}
    for i, cand in enumerate(fleet_owners, 1):
        prof = fetch_host_profile(cand.owner_id)
        profiles[cand.owner_id] = prof
        if prof is None:
            print(f"  [{i}/{len(fleet_owners)}] {cand.owner_id}: profile unavailable")
        else:
            tag = "DEALER" if prof.dealer else ("PRO" if prof.pro else ("SUPERHOST" if prof.is_superhost else "host"))
            print(f"  [{i}/{len(fleet_owners)}] {cand.owner_id} {tag} | "
                  f"{prof.host_name or '(no name)'} | "
                  f"{cand.listing_count} listings | "
                  f"web={'Y' if prof.business_website else '·'} "
                  f"phone={'Y' if prof.business_phone else '·'}")
            if not args.no_bio_mine:
                bio_mined[cand.owner_id] = mine_bio(prof)
        time.sleep(USER_DELAY_SEC)

    # ── Stage 3: optional Firecrawl fallback for missing websites ─────────────
    firecrawl_app = None
    fc_websites: dict[str, str] = {}
    if args.firecrawl_fallback:
        firecrawl_app = _maybe_load_firecrawl()
    if firecrawl_app is not None:
        market_label = args.address
        targets = [
            cand for cand in fleet_owners
            if (profiles.get(cand.owner_id)
                and not (profiles[cand.owner_id].business_website or
                         (bio_mined.get(cand.owner_id, ("", "", []))[0])))
        ]
        print(f"\n[3/3] Firecrawl fallback for {len(targets)} hosts with no website...")
        for i, cand in enumerate(targets, 1):
            prof = profiles[cand.owner_id]
            assert prof is not None
            name = prof.business_name or prof.host_name
            if not name:
                continue
            url = firecrawl_enrich_website(firecrawl_app, name, market_label)
            if url:
                fc_websites[cand.owner_id] = url
                print(f"  [{i}/{len(targets)}] {name} → {url}")
            time.sleep(1.0)
    else:
        print(f"\n[3/3] Skipping Firecrawl fallback.")

    # ── Emit CSV ──────────────────────────────────────────────────────────────
    scraped_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    rows: list[dict[str, Any]] = []
    for cand in fleet_owners:
        prof = profiles.get(cand.owner_id)
        bio_web, bio_email, bio_socials = bio_mined.get(cand.owner_id, ("", "", []))
        extra_website = bio_web or fc_websites.get(cand.owner_id, "")
        rows.append(to_row(
            cand, prof,
            market=market, scraped_at=scraped_at,
            extra_website=extra_website,
            extra_email=bio_email,
            extra_socials=bio_socials,
        ))

    print(f"\nWriting {len(rows)} rows → {output}")
    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    # ── Summary ───────────────────────────────────────────────────────────────
    have_website = sum(1 for r in rows if r["Website"])
    have_phone = sum(1 for r in rows if r["Phone"])
    have_email = sum(1 for r in rows if r["Email"])
    dealers = sum(1 for r in rows if r["Dealer"] == "true")
    pros = sum(1 for r in rows if r["Pro"] == "true")
    superhosts = sum(1 for r in rows if r["Superhost"] == "true")

    print()
    print("=" * 64)
    print("SUMMARY")
    print("=" * 64)
    print(f"  Rentals scanned          : {total_rentals}")
    print(f"  Unique owners            : {len(by_owner)}")
    print(f"  Fleet candidates (≥{args.min_listings})    : {len(fleet_owners)}")
    print(f"  Profiles fetched         : {sum(1 for p in profiles.values() if p)}")
    print(f"  Dealers                  : {dealers}")
    print(f"  Outdoorsy Pro            : {pros}")
    print(f"  Superhosts               : {superhosts}")
    print(f"  With website             : {have_website}/{len(rows)}")
    print(f"  With phone               : {have_phone}/{len(rows)}")
    print(f"  With email               : {have_email}/{len(rows)}")
    print(f"  Output                   : {output}")
    print("=" * 64)
    return 0


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[,\s]+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "market"


if __name__ == "__main__":
    sys.exit(main())
