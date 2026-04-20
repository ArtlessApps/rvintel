#!/usr/bin/env python3
"""
Outdoorsy San Diego RV Fleet Owner Lead Generator
Scrapes Outdoorsy for RV listings in San Diego, identifies fleet owners (2+ listings),
and enriches each with contact/web info via Google search.
"""

import csv
import re
import time
from typing import Optional, List
from urllib.parse import urlparse

from firecrawl import FirecrawlApp

# ── Config ────────────────────────────────────────────────────────────────────
import os
FIRECRAWL_API_KEY = os.environ["FIRECRAWL_API_KEY"]
SEARCH_BASE = "https://www.outdoorsy.com/search?address=San+Diego%2C+CA&type=rv-rental"
OUTPUT_FILE = "san_diego_rv_leads.csv"
MIN_LISTINGS = 2
REQUEST_DELAY = 2.5
MAX_PAGES = 5
CSV_COLUMNS = [
    "Host Name", "Business Name", "Listing Count", "Review Count",
    "Rating", "Profile URL", "Website", "Email", "Social Media"
]

app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)


# ── Helpers ───────────────────────────────────────────────────────────────────

def scrape(url: str, formats: List[str] = None) -> Optional[object]:
    """Scrape a URL with Firecrawl, return Document or None on failure."""
    if formats is None:
        formats = ["markdown", "links"]
    try:
        return app.scrape(url, formats=formats)
    except Exception as e:
        print(f"  [skip] {url}: {e}")
        return None


def get_links(doc) -> List[str]:
    links = getattr(doc, "links", None) or []
    return [l if isinstance(l, str) else l.get("href", "") for l in links]


def get_markdown(doc) -> str:
    return getattr(doc, "markdown", "") or ""


def extract_listing_urls(doc) -> List[str]:
    """Extract individual RV listing URLs from a search results page."""
    urls = set()
    for link in get_links(doc):
        # Pattern: /rv-rental/<city_state>/<year_make_model_id>-listing
        if re.search(r'outdoorsy\.com/rv-rental/.+-listing', link):
            clean = link.split("?")[0]
            urls.add(clean)
    # Also check markdown
    md = get_markdown(doc)
    for m in re.findall(r'https://www\.outdoorsy\.com/rv-rental/[^\s\)\]"\'<>]+-listing', md):
        urls.add(m.split("?")[0])
    return list(urls)


def extract_host_profile_url(doc) -> Optional[str]:
    """Extract the /pro/<id> host profile URL from a listing page."""
    for link in get_links(doc):
        if re.search(r'outdoorsy\.com/pro/\d+$', link):
            return link.split("?")[0]
    md = get_markdown(doc)
    m = re.search(r'https://www\.outdoorsy\.com/pro/(\d+)', md)
    if m:
        return f"https://www.outdoorsy.com/pro/{m.group(1)}"
    return None


def parse_host_profile(doc, profile_url: str) -> dict:
    """Extract host data from a /pro/<id> profile page."""
    md = get_markdown(doc)
    metadata = getattr(doc, "metadata", {}) or {}

    host = {
        "Host Name": "",
        "Business Name": "",
        "Listing Count": 0,
        "Review Count": 0,
        "Rating": "",
        "Profile URL": profile_url,
        "Website": "",
        "Email": "",
        "Social Media": "",
    }

    # Host/business name — "About <Name>" heading
    about_match = re.search(r'#+ About (.+)', md)
    if about_match:
        name = about_match.group(1).strip()
        # If name contains business-like words, store as Business Name too
        if any(w in name for w in ["LLC", "Inc", "Rental", "Fleet", "RV", "Adventures", "Outdoors"]):
            host["Business Name"] = name
        host["Host Name"] = name

    # Fallback: page title
    if not host["Host Name"]:
        title = metadata.get("title", "") if isinstance(metadata, dict) else getattr(metadata, "title", "")
        if title:
            host["Host Name"] = re.split(r" \| | on Outdoorsy", title)[0].strip()

    # Listing count — "X RV available to rent" or "X RVs available to rent"
    listing_match = re.search(r'(\d+)\s+RV[s]?\s+available to rent', md, re.IGNORECASE)
    if listing_match:
        host["Listing Count"] = int(listing_match.group(1))
    else:
        # Fallback: count listing links on the profile page
        listing_links = [l for l in get_links(doc) if re.search(r'/rv-rental/.+-listing', l)]
        unique_listings = {l.split("?")[0] for l in listing_links}
        if unique_listings:
            host["Listing Count"] = len(unique_listings)

    # Review count
    review_match = re.search(r'(\d+)\s+review', md, re.IGNORECASE)
    if review_match:
        host["Review Count"] = int(review_match.group(1))

    # Rating — leading "5.0" or "4.9" at top of profile
    rating_match = re.search(r'^([45]\.\d)', md.strip())
    if not rating_match:
        rating_match = re.search(r'\n([45]\.\d)\n', md)
    if rating_match:
        host["Rating"] = rating_match.group(1)

    return host


def firecrawl_search_enrich(host: dict) -> dict:
    """Use Firecrawl search to find website, email, and social media for a host."""
    query_name = host["Business Name"] or host["Host Name"]
    if not query_name:
        return host

    query = f'{query_name} San Diego RV rental'
    skip_domains = {
        "outdoorsy.com", "rvshare.com", "hipcamp.com", "yelp.com",
        "tripadvisor.com", "yellowpages.com", "bbb.org", "mapquest.com",
        "local.yahoo.com", "google.com",
    }

    try:
        result = app.search(query, limit=8)
        web_results = getattr(result, "web", []) or []
    except Exception as e:
        print(f"  [search] Failed for '{query_name}': {e}")
        return host

    social_found = []
    website_found = ""
    email_found = ""

    for item in web_results:
        url = getattr(item, "url", "") or ""
        description = getattr(item, "description", "") or ""
        domain = urlparse(url).netloc.replace("www.", "")

        # Hunt for email in description text
        if not email_found:
            emails = re.findall(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', description)
            for em in emails:
                if not any(s in em for s in ["google.", "schema.", "example."]):
                    email_found = em
                    break

        if any(skip in domain for skip in skip_domains):
            continue

        if "instagram.com" in domain or "facebook.com" in domain:
            social_found.append(url.split("?")[0])
        elif not website_found:
            website_found = url.split("?")[0]

    # If we have a website, scrape it briefly for an email address
    if website_found and not email_found:
        try:
            doc = app.scrape(website_found, formats=["markdown"])
            page_text = getattr(doc, "markdown", "") or ""
            emails = re.findall(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', page_text)
            for em in emails:
                if not any(s in em for s in ["google.", "schema.", "example.", "sentry.", "amazonaws."]):
                    email_found = em
                    break
        except Exception:
            pass

    host["Website"] = website_found
    host["Email"] = email_found
    host["Social Media"] = " | ".join(social_found[:2])
    return host


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Outdoorsy San Diego Fleet Owner Lead Generator")
    print("=" * 60)

    # Step 1: Collect listing URLs from search pages
    print(f"\n[1/4] Scanning search results (up to {MAX_PAGES} pages)...")
    all_listing_urls = set()

    for page_num in range(1, MAX_PAGES + 1):
        page_url = SEARCH_BASE if page_num == 1 else f"{SEARCH_BASE}&page={page_num}"
        print(f"  Page {page_num}: {page_url}")

        doc = scrape(page_url)
        if not doc:
            break

        urls = extract_listing_urls(doc)
        print(f"    → {len(urls)} listing URLs found")
        all_listing_urls.update(urls)
        time.sleep(REQUEST_DELAY)

        if len(urls) < 3 and page_num > 1:
            print("  Appears to be last page.")
            break

    print(f"\n  Total unique listings: {len(all_listing_urls)}")

    # Step 2: Visit each listing to get host profile URL
    print(f"\n[2/4] Extracting host profiles from {len(all_listing_urls)} listings...")
    all_host_urls = set()

    for i, listing_url in enumerate(sorted(all_listing_urls), 1):
        print(f"  [{i}/{len(all_listing_urls)}] {listing_url.split('/')[-1]}")
        doc = scrape(listing_url)
        if not doc:
            time.sleep(REQUEST_DELAY)
            continue

        host_url = extract_host_profile_url(doc)
        if host_url:
            all_host_urls.add(host_url)
            print(f"    → host: {host_url}")
        else:
            print(f"    → no host URL found")
        time.sleep(REQUEST_DELAY)

    print(f"\n  Unique host profiles: {len(all_host_urls)}")

    # Step 3: Visit each host profile
    print(f"\n[3/4] Scraping {len(all_host_urls)} host profiles...")
    all_hosts = []

    for i, profile_url in enumerate(sorted(all_host_urls), 1):
        print(f"  [{i}/{len(all_host_urls)}] {profile_url}")
        doc = scrape(profile_url)
        if not doc:
            time.sleep(REQUEST_DELAY)
            continue

        host = parse_host_profile(doc, profile_url)
        all_hosts.append(host)
        print(f"    → {host['Host Name'] or '(unnamed)'} | "
              f"{host['Listing Count']} listings | "
              f"{host['Review Count']} reviews | "
              f"★ {host['Rating']}")
        time.sleep(REQUEST_DELAY)

    # Filter fleet owners
    fleet_owners = [h for h in all_hosts if h["Listing Count"] >= MIN_LISTINGS]
    print(f"\n  Fleet owners (≥{MIN_LISTINGS} listings): {len(fleet_owners)} of {len(all_hosts)}")

    # Step 4: Google enrich fleet owners
    print(f"\n[4/4] Enriching {len(fleet_owners)} fleet owners via Google search...")
    for i, host in enumerate(fleet_owners, 1):
        name = host["Business Name"] or host["Host Name"] or "?"
        print(f"  [{i}/{len(fleet_owners)}] {name}")
        firecrawl_search_enrich(host)
        time.sleep(REQUEST_DELAY)

    # Write CSV
    print(f"\nWriting results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(fleet_owners)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Listings scraped:           {len(all_listing_urls)}")
    print(f"  Total hosts found:          {len(all_hosts)}")
    print(f"  Fleet owners (≥{MIN_LISTINGS} listings):  {len(fleet_owners)}")
    print(f"  With website found:         {sum(1 for h in fleet_owners if h['Website'])}")
    print(f"  With email found:           {sum(1 for h in fleet_owners if h['Email'])}")
    print(f"  With social media found:    {sum(1 for h in fleet_owners if h['Social Media'])}")
    print(f"\n  Output: {OUTPUT_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
