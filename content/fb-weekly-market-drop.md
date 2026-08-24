# Weekly FB market drop

Casual, data-first post in the big RV host Facebook group. **One market per week.** No DMs, no “reach out,” no soft pitch for custom reports.

Goal: give hosts a useful number → send them to a self-serve page.

---

## Weekly checklist (15–20 min)

1. Pick next market from the [rotation](#market-rotation) (skip if you posted it in the last ~8 weeks).
2. Refresh numbers if stale: `pnpm magnets <slug>` (optional; monthly is fine).
3. Open the Markdown rate card: `content/magnets/<slug>-rate-card.md`
4. Copy the post from [templates](#post-templates) and fill blanks from that file.
5. Links to use (prefer the calculator — it's the linkable asset):
   - **RV rental ROI calculator (primary):** `https://www.rvintel.io/tools/roi-calculator?market=<slug>`
   - Market page: `https://www.rvintel.io/markets/<slug>`
   - Rate card (optional screenshot / first-comment extra): `https://www.rvintel.io/magnets/<slug>-rate-card.html`
   - All markets: `https://www.rvintel.io/markets`
6. Post in the group (text + link; screenshot of the rate card HTML is optional eye candy).
7. Log the date + market in the [log](#post-log) at the bottom.
8. If people comment cities: reply once in-thread with the hub link (or note “next week”). Do **not** start DMs.

---

## Rules

- Lead with **one concrete number** (median, or a class median). Tool name is secondary.
- Soft brand only: “pulled from Outdoorsy + RVshare” / “RVIntel tracks this” is enough.
- CTA is always a **link**, never “message me.”
- Don’t argue pricing advice in comments. Point back to the calculator / market page.
- If admins hate links: put the numbers in the post body and drop the link in the **first comment**.

---

## Post templates

Replace brackets. Keep it short.

### A — Default (use most weeks)

```
Quick [City] rate check for hosts —

Median asking rate right now: $[median]/night across [N] active listings on Outdoorsy + RVshare ([radius] mi).

By class (median):
• [Class 1]: $[m1]
• [Class 2]: $[m2]
• [Class 3]: $[m3]

Plug those rates into the free RV rental ROI calculator: [roi-calculator URL]
Other cities: https://www.rvintel.io/markets

Curious which market I should drop next week? Comment the city.
```

### B — Shorter (when the group is link-sensitive)

```
[City] hosts — median nightly ask is about $[median] right now ([N] listings, Outdoorsy + RVshare).

Travel trailers ~$[tt] · Class C ~$[cc] · Class B ~$[cb]

1-pager with the breakdown is in the first comment. Other markets on the site if you want your city.
```

*First comment:*
```
Run the numbers: [City] RV rental ROI calculator → [roi-calculator URL]
[City] rate card → [rate-card URL]
All markets → https://www.rvintel.io/markets
```

### C — Class-focused (when one class dominates the market)

```
For [City] [Class] hosts —

Median ask is $[class median]/night ([class count] [Class] listings in-market). Overall market median is $[median] across [N] listings.

ROI calculator with these rates: [roi-calculator URL]
Browse other metros: https://www.rvintel.io/markets
```

---

## Comment reply cheatsheet

| They say | You reply |
| --- | --- |
| “Do you have [other city]?” | “Yep — [city] is here: https://www.rvintel.io/markets/[slug] (or browse all: /markets). I rotate one city a week in here.” |
| “How do you get this?” | “Public Outdoorsy + RVshare listing data, geo-scoped. Card shows median / avg / class mix.” |
| “Can you look at *my* listing?” | “Not in DMs — start free trial on the market page and use the dashboard for comps.” |
| “Is this a sales pitch?” | “Nope — sharing the [City] snapshot. Link is the free ROI calculator; product is optional.” |
| Price debate / “my market is different” | “Totals are asking rates across active listings in a [radius] mi window — your comps may differ by class/length. Card has the class split.” |

---

## Market rotation

Work top-to-bottom; tick the log when posted. Prefer markets with real host density in that FB group when you know it (SoCal, Phoenix, Texas, Florida often travel well).

| # | Market | Slug |
| ---: | --- | --- |
| 1 | San Diego, CA | `san-diego-ca` |
| 2 | Phoenix, AZ | `phoenix-az` |
| 3 | Los Angeles, CA | `los-angeles-ca` |
| 4 | Denver, CO | `denver-co` |
| 5 | Austin, TX | `austin-tx` |
| 6 | Orlando, FL | `orlando-fl` |
| 7 | Seattle, WA | `seattle-wa` |
| 8 | Dallas–Fort Worth, TX | `dallas-fort-worth-tx` |
| 9 | Riverside County, CA | `riverside-county-ca` |
| 10 | Portland, OR | `portland-or` |
| 11 | Tampa, FL | `tampa-fl` |
| 12 | Salt Lake City, UT | `salt-lake-city-ut` |
| 13 | Atlanta, GA | `atlanta-ga` |
| 14 | Sacramento, CA | `sacramento-ca` |
| 15 | San Antonio, TX | `san-antonio-tx` |
| 16 | Las Vegas area / Reno | `reno-nv` |
| 17 | Long Beach, CA | `long-beach-ca` |
| 18 | Philadelphia, PA | `philadelphia-pa` |
| 19 | Washington, DC | `washington-dc` |
| 20 | New York, NY | `new-york-ny` |
| 21 | Detroit, MI | `detroit-mi` |
| 22 | Columbus, OH | `columbus-oh` |
| 23 | San Francisco, CA | `san-francisco-ca` |
| 24 | San Jose, CA | `san-jose-ca` |
| 25 | Grand Rapids, MI | `grand-rapids-mi` |
| 26 | Milwaukee, WI | `milwaukee-wi` |
| 27 | Cincinnati, OH | `cincinnati-oh` |
| 28 | Chattanooga, TN | `chattanooga-tn` |
| 29 | Baltimore, MD | `baltimore-md` |
| 30 | Harrisburg, PA | `harrisburg-pa` |
| 31 | Madison, WI | `madison-wi` |
| 32 | Cheyenne, WY | `cheyenne-wy` |
| 33 | ArkLaTex | `arklatex` |
| 34 | Minneapolis, MN | `minneapolis-mn` |
| 35 | Hartford, CT | `hartford-ct` |

---

## Post log

| Date | Market | Template (A/B/C) | Notes |
| --- | --- | --- | --- |
| | | | |

---

## Assets

- Markdown (copy stats): `content/magnets/<slug>-rate-card.md`
- Shareable HTML: `https://www.rvintel.io/magnets/<slug>-rate-card.html`
- Regenerate all: `pnpm magnets`
- Regenerate one: `pnpm magnets san-diego-ca`
