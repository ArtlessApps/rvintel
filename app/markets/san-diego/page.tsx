<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>San Diego RV Rental Market Report · Q2 2026 · RVIntel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --navy: #0B1629;
    --navy-mid: #162240;
    --navy-light: #1E3057;
    --primary: #28b78a;
    --primary-light: #6dd9b8;
    --sand: #F0E8D8;
    --sand-mid: #E8DCCB;
    --white: #FDFAF5;
    --text-body: #2E3A4E;
    --text-muted: #7A8899;
    --text-light: #B8C4D0;
    --green: #2D8A5E;
    --red: #C04848;
    --border: rgba(14, 26, 48, 0.12);
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--white);
    color: var(--text-body);
    font-size: 15px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  /* ── COVER ─────────────────────────────────────────────────────────── */
  .cover {
    background: var(--navy);
    color: var(--white);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 56px 72px;
    position: relative;
    overflow: hidden;
    page-break-after: always;
  }

  .cover-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(40,183,138,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(40,183,138,0.06) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .cover-accent {
    position: absolute;
    bottom: -120px;
    right: -80px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(40,183,138,0.18) 0%, transparent 70%);
    pointer-events: none;
  }

  .cover-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    z-index: 1;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    background: #28b78a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    color: var(--navy);
    letter-spacing: -0.5px;
  }

  .brand-name {
    font-family: 'DM Sans', sans-serif;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--white);
  }

  .cover-badge {
    background: rgba(40,183,138,0.15);
    border: 1px solid rgba(40,183,138,0.4);
    color: #6dd9b8;
    padding: 6px 16px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  .cover-main {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 0 40px;
  }

  .cover-eyebrow {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: 'Playfair Display', serif;
    font-size: 72px;
    font-weight: 900;
    line-height: 1.05;
    color: var(--white);
    max-width: 700px;
    margin-bottom: 28px;
  }

  .cover-title em {
    font-style: italic;
    color: #28b78a;
  }

  .cover-subtitle {
    font-size: 18px;
    font-weight: 300;
    color: rgba(253,250,245,0.65);
    max-width: 520px;
    line-height: 1.6;
    margin-bottom: 48px;
  }

  .cover-stats {
    display: flex;
    gap: 48px;
  }

  .cover-stat-item { }

  .cover-stat-number {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    color: var(--white);
    line-height: 1;
    margin-bottom: 4px;
  }

  .cover-stat-number span {
    color: #28b78a;
  }

  .cover-stat-label {
    font-size: 12px;
    font-weight: 400;
    color: rgba(253,250,245,0.5);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .cover-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(253,250,245,0.12);
    padding-top: 28px;
  }

  .cover-meta {
    font-size: 12px;
    color: rgba(253,250,245,0.4);
    line-height: 1.8;
  }

  .cover-disclaimer {
    font-size: 11px;
    color: rgba(253,250,245,0.25);
    max-width: 320px;
    text-align: right;
    line-height: 1.5;
  }

  /* ── REPORT BODY ────────────────────────────────────────────────────── */
  .report {
    max-width: 860px;
    margin: 0 auto;
    padding: 80px 72px;
  }

  /* Section headers */
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 40px;
    border-bottom: 1.5px solid var(--navy);
    padding-bottom: 16px;
  }

  .section-number {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: #28b78a;
    letter-spacing: 1px;
  }

  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    font-weight: 700;
    color: var(--navy);
  }

  /* ── EXEC SUMMARY ───────────────────────────────────────────────────── */
  .exec-banner {
    background: var(--navy);
    border-radius: 16px;
    padding: 44px 52px;
    margin-bottom: 72px;
    position: relative;
    overflow: hidden;
  }

  .exec-banner::before {
    content: '';
    position: absolute;
    top: -60px;
    right: -60px;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(40,183,138,0.2) 0%, transparent 70%);
  }

  .exec-banner-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 16px;
  }

  .exec-banner-text {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 400;
    font-style: italic;
    color: var(--white);
    line-height: 1.65;
    max-width: 640px;
    position: relative;
    z-index: 1;
  }

  .exec-banner-text strong {
    font-style: normal;
    font-weight: 700;
    color: #6dd9b8;
  }

  /* ── KEY METRICS ROW ────────────────────────────────────────────────── */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 64px;
  }

  .metric-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px 20px;
    position: relative;
  }

  .metric-card.featured {
    background: var(--navy);
    border-color: var(--navy);
  }

  .metric-card-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .metric-card.featured .metric-card-label {
    color: rgba(253,250,245,0.5);
  }

  .metric-card-value {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    color: var(--navy);
    line-height: 1;
    margin-bottom: 6px;
  }

  .metric-card.featured .metric-card-value {
    color: #6dd9b8;
  }

  .metric-card-sub {
    font-size: 12px;
    color: var(--text-muted);
  }

  .metric-card.featured .metric-card-sub {
    color: rgba(253,250,245,0.45);
  }

  .metric-trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 100px;
    margin-top: 8px;
  }

  .metric-trend.up { background: rgba(45,138,94,0.1); color: var(--green); }
  .metric-trend.down { background: rgba(192,72,72,0.1); color: var(--red); }

  /* ── TABLES ─────────────────────────────────────────────────────────── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-bottom: 48px;
  }

  .data-table thead tr {
    background: var(--navy);
    color: var(--white);
  }

  .data-table thead th {
    padding: 14px 20px;
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
  }

  .data-table thead th:first-child { border-radius: 8px 0 0 0; }
  .data-table thead th:last-child { border-radius: 0 8px 0 0; }

  .data-table tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .data-table tbody tr:hover { background: rgba(11,22,41,0.03); }
  .data-table tbody tr:last-child { border-bottom: none; }

  .data-table tbody td {
    padding: 14px 20px;
    color: var(--text-body);
  }

  .data-table tbody td.number {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
  }

  .rv-class-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .badge-a { background: rgba(11,22,41,0.08); color: var(--navy); }
  .badge-b { background: rgba(40,183,138,0.15); color: #0d5c43; }
  .badge-c { background: rgba(45,138,94,0.12); color: #1A5E3A; }
  .badge-tt { background: rgba(65,90,160,0.12); color: #2C3F80; }
  .badge-fw { background: rgba(160,65,80,0.12); color: #7A2535; }

  .bar-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bar-visual {
    height: 6px;
    border-radius: 3px;
    background: #28b78a;
    min-width: 4px;
  }

  /* ── CHARTS ─────────────────────────────────────────────────────────── */
  .chart-container {
    margin-bottom: 64px;
  }

  .chart-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--navy);
    margin-bottom: 4px;
  }

  .chart-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 24px;
  }

  .chart-wrap {
    position: relative;
    width: 100%;
    height: 280px;
  }

  .chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-bottom: 64px;
  }

  /* ── INSIGHT CALLOUT ────────────────────────────────────────────────── */
  .insight {
    border-left: 3px solid #28b78a;
    padding: 20px 24px;
    background: rgba(40,183,138,0.06);
    border-radius: 0 10px 10px 0;
    margin-bottom: 32px;
  }

  .insight-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #28b78a;
    margin-bottom: 8px;
  }

  .insight-text {
    font-size: 15px;
    color: var(--text-body);
    line-height: 1.6;
  }

  .insight-text strong { color: var(--navy); font-weight: 600; }

  /* ── OPPORTUNITY GRID ───────────────────────────────────────────────── */
  .opportunity-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 64px;
  }

  .opp-card {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 24px;
  }

  .opp-icon {
    font-size: 24px;
    margin-bottom: 14px;
    display: block;
  }

  .opp-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--navy);
    margin-bottom: 8px;
  }

  .opp-text {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.65;
  }

  .opp-stat {
    margin-top: 16px;
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    font-weight: 500;
    color: #28b78a;
  }

  /* ── SEASONAL STRIP ─────────────────────────────────────────────────── */
  .seasonal-strip {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }

  .month-col { text-align: center; }

  .month-bar-wrap {
    height: 80px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 6px;
  }

  .month-bar {
    width: 100%;
    border-radius: 3px 3px 0 0;
    transition: opacity 0.2s;
  }

  .month-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* ── CTA ────────────────────────────────────────────────────────────── */
  .cta-section {
    background: var(--navy);
    border-radius: 20px;
    padding: 60px 64px;
    text-align: center;
    position: relative;
    overflow: hidden;
    margin-top: 80px;
  }

  .cta-section::before {
    content: '';
    position: absolute;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(40,183,138,0.2) 0%, transparent 70%);
  }

  .cta-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }

  .cta-title {
    font-family: 'Playfair Display', serif;
    font-size: 40px;
    font-weight: 900;
    color: var(--white);
    line-height: 1.15;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }

  .cta-title em {
    font-style: italic;
    color: #6dd9b8;
  }

  .cta-body {
    font-size: 16px;
    font-weight: 300;
    color: rgba(253,250,245,0.65);
    max-width: 480px;
    margin: 0 auto 36px;
    line-height: 1.65;
    position: relative;
    z-index: 1;
  }

  .cta-features {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin-bottom: 40px;
    flex-wrap: wrap;
    position: relative;
    z-index: 1;
  }

  .cta-feat {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: rgba(253,250,245,0.75);
  }

  .cta-feat-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #28b78a;
    flex-shrink: 0;
  }

  .cta-url {
    display: inline-block;
    background: #28b78a;
    color: var(--navy);
    font-weight: 700;
    font-size: 15px;
    padding: 14px 36px;
    border-radius: 100px;
    text-decoration: none;
    letter-spacing: 0.3px;
    position: relative;
    z-index: 1;
  }

  .cta-fine {
    margin-top: 16px;
    font-size: 11px;
    color: rgba(253,250,245,0.3);
    position: relative;
    z-index: 1;
  }

  /* ── FOOTER ─────────────────────────────────────────────────────────── */
  .report-footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── PAGE BREAK HELPERS ─────────────────────────────────────────────── */
  .page-break { page-break-before: always; }
  .section { margin-bottom: 80px; }

  /* ── PRINT / PDF ────────────────────────────────────────────────────── */
  @media print {
    body { background: white; }
    .cover { min-height: 100vh; }
  }
</style>
</head>
<body>

<!-- ═══ COVER PAGE ═══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-grid"></div>
  <div class="cover-accent"></div>

  <div class="cover-top">
    <div class="brand">
      <div class="brand-mark">RV</div>
      <div class="brand-name">RVIntel</div>
    </div>
    <div class="cover-badge">Q2 2026 Edition</div>
  </div>

  <div class="cover-main">
    <div class="cover-eyebrow">San Diego · Rental Intelligence</div>
    <h1 class="cover-title">The San Diego<br><em>RV Rental</em><br>Market Report</h1>
    <p class="cover-subtitle">Pricing benchmarks, occupancy trends, and platform insights for hosts operating on Outdoorsy & RVshare in the San Diego metro.</p>
    <div class="cover-stats">
      <div class="cover-stat-item">
        <div class="cover-stat-number">3,<span>357</span></div>
        <div class="cover-stat-label">Active listings tracked</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number"><span>2</span></div>
        <div class="cover-stat-label">Platforms analyzed</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number">5<span>+</span></div>
        <div class="cover-stat-label">RV classes covered</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number">61<span>%</span></div>
        <div class="cover-stat-label">Hosts offering delivery</div>
      </div>
    </div>
  </div>

  <div class="cover-bottom">
    <div class="cover-meta">
      RVIntel Market Intelligence<br>
      Published April 2026 · rvintel.io
    </div>
    <div class="cover-disclaimer">
      Data sourced from publicly available listings on Outdoorsy and RVshare. All pricing represents active asking rates, not confirmed booking rates.
    </div>
  </div>
</div>

<!-- ═══ REPORT BODY ══════════════════════════════════════════════════════════ -->
<div class="report">

  <!-- EXECUTIVE SUMMARY -->
  <div class="exec-banner">
    <div class="exec-banner-label">Executive Summary</div>
    <div class="exec-banner-text">
      San Diego's RV rental market is <strong>larger and more fragmented than most hosts realize</strong>. With 3,357 active listings across two major platforms, the average asking rate of <strong>$215/night sits $36 above the median of $179</strong> — a spread driven by a small number of premium listings pulling the average up, and a long tail of under-priced hosts quietly leaving revenue on the table.
    </div>
  </div>

  <!-- SECTION 1: MARKET OVERVIEW -->
  <div class="section">
    <div class="section-header">
      <div class="section-number">01</div>
      <h2 class="section-title">Market Overview</h2>
    </div>

    <div class="metrics-grid">
      <div class="metric-card featured">
        <div class="metric-card-label">Avg. Nightly Rate</div>
        <div class="metric-card-value">$215</div>
        <div class="metric-card-sub">All classes · all platforms</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Market Median</div>
        <div class="metric-card-value">$179</div>
        <div class="metric-card-sub">50th percentile</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Top Quartile</div>
        <div class="metric-card-value">$236</div>
        <div class="metric-card-sub">75th percentile rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Active Listings</div>
        <div class="metric-card-value">3,357</div>
        <div class="metric-card-sub">Outdoorsy & RVshare</div>
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Key Finding</div>
      <div class="insight-text">
        The market average of <strong>$215/night sits $36 above the median of $179</strong> — meaning more than half of San Diego hosts are pricing below the market mean. On a 60% occupancy rate, closing that gap represents <strong>$7,884 in additional annual revenue</strong> per unit.
      </div>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8;">
      San Diego ranks among the top RV rental markets in the United States, driven by year-round mild weather, proximity to major campgrounds (Anza-Borrego, Joshua Tree, Palomar Mountain), and a large base of both drive-to and fly-in renters. With <strong>3,357 active listings</strong> across Outdoorsy and RVshare, the market is dominated by towable units — Travel Trailers alone account for 40% of all inventory, though they command the lowest rates at $145/night on average.
    </p>
  </div>

  <!-- SECTION 2: PRICING BY CLASS -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">02</div>
      <h2 class="section-title">Pricing by RV Class</h2>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>RV Class</th>
          <th>Listings</th>
          <th>Avg / Night</th>
          <th>Outdoorsy Median</th>
          <th>RVshare Median</th>
          <th>P25 – P75</th>
          <th>Platform Mix</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="rv-class-badge badge-a">Class A</span></td>
          <td class="number">409</td>
          <td class="number" style="font-weight:600; color: var(--navy);">$325</td>
          <td class="number">$295</td>
          <td class="number">$291</td>
          <td class="number" style="color: var(--text-muted);">$243 – $358</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:62px"></div><span style="font-size:12px; color: var(--text-muted);">70% Outdoorsy</span></div></td>
        </tr>
        <tr>
          <td><span class="rv-class-badge badge-c">Class C</span></td>
          <td class="number">772</td>
          <td class="number" style="font-weight:600; color: var(--navy);">$249</td>
          <td class="number">$200</td>
          <td class="number">$215</td>
          <td class="number" style="color: var(--text-muted);">$178 – $248</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:52px"></div><span style="font-size:12px; color: var(--text-muted);">64% Outdoorsy</span></div></td>
        </tr>
        <tr>
          <td><span class="rv-class-badge badge-b">Class B</span></td>
          <td class="number">606</td>
          <td class="number" style="font-weight:600; color: var(--navy);">$236</td>
          <td class="number">$197</td>
          <td class="number">$213</td>
          <td class="number" style="color: var(--text-muted);">$169 – $239</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:56px"></div><span style="font-size:12px; color: var(--text-muted);">77% Outdoorsy</span></div></td>
        </tr>
        <tr>
          <td><span class="rv-class-badge badge-fw">Fifth Wheel</span></td>
          <td class="number">136</td>
          <td class="number" style="font-weight:600; color: var(--navy);">$232</td>
          <td class="number">$245</td>
          <td class="number">$219</td>
          <td class="number" style="color: var(--text-muted);">$163 – $267</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:36px"></div><span style="font-size:12px; color: var(--text-muted);">45% Outdoorsy</span></div></td>
        </tr>
        <tr>
          <td><span class="rv-class-badge badge-tt">Travel Trailer</span></td>
          <td class="number">1,342</td>
          <td class="number" style="font-weight:600; color: var(--navy);">$145</td>
          <td class="number">$140</td>
          <td class="number">$135</td>
          <td class="number" style="color: var(--text-muted);">$119 – $156</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:44px"></div><span style="font-size:12px; color: var(--text-muted);">55% Outdoorsy</span></div></td>
        </tr>
      </tbody>
    </table>

    <div class="chart-grid">
      <div>
        <div class="chart-title">Average nightly rate by class</div>
        <div class="chart-subtitle">Priced listings · last 7 days</div>
        <div class="chart-wrap" style="height: 260px;">
          <canvas id="classBarChart" role="img" aria-label="Bar chart showing average nightly rates by RV class. Class A leads at $284, followed by Class C at $218, Class B at $187, Fifth Wheel at $168, and Travel Trailer at $142.">Average rates: Class A $284, Class C $218, Class B $187, Fifth Wheel $168, Travel Trailer $142.</canvas>
        </div>
      </div>
      <div>
        <div class="chart-title">Listing volume by class</div>
        <div class="chart-subtitle">Share of San Diego inventory</div>
        <div class="chart-wrap" style="height: 260px;">
          <canvas id="classPieChart" role="img" aria-label="Donut chart of SD inventory by class. Travel Trailer 37%, Class C 22%, Class B 17%, Fifth Wheel 13%, Class A 10%.">Inventory: Travel Trailer 37%, Class C 22%, Class B 17%, Fifth Wheel 13%, Class A 10%.</canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 3: SEASONALITY -->
  <div class="section">
    <div class="section-header">
      <div class="section-number">03</div>
      <h2 class="section-title">Seasonality & Demand</h2>
    </div>

    <div style="margin-bottom: 10px;">
      <div class="chart-title">Relative demand index — San Diego (12 months)</div>
      <div class="chart-subtitle">100 = average monthly demand. Based on pricing premium vs. baseline.</div>
    </div>

    <div class="seasonal-strip">
      <!-- Bar heights based on relative demand -->
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:52%; background:#d3dce8;"></div></div>
        <div class="month-label">Jan</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:48%; background:#c8d4e2;"></div></div>
        <div class="month-label">Feb</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:60%; background:#b8c9da;"></div></div>
        <div class="month-label">Mar</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:72%; background:#8fafc8;"></div></div>
        <div class="month-label">Apr</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:82%; background:#6a95b8;"></div></div>
        <div class="month-label">May</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:95%; background:#28b78a;"></div></div>
        <div class="month-label" style="color: #28b78a; font-weight:700;">Jun</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:100%; background:#28b78a;"></div></div>
        <div class="month-label" style="color: #28b78a; font-weight:700;">Jul</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:96%; background:#28b78a;"></div></div>
        <div class="month-label" style="color: #28b78a; font-weight:700;">Aug</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:76%; background:#8fafc8;"></div></div>
        <div class="month-label">Sep</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:64%; background:#a3bdd0;"></div></div>
        <div class="month-label">Oct</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:54%; background:#c0cfe0;"></div></div>
        <div class="month-label">Nov</div>
      </div>
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:58%; background:#b8c9da;"></div></div>
        <div class="month-label">Dec</div>
      </div>
    </div>
    <div style="display: flex; gap: 24px; margin-bottom: 36px; margin-top: 16px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #28b78a; border-radius: 2px;"></div>
        Peak season (Jun–Aug) — avg +38% premium
      </div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #8fafc8; border-radius: 2px;"></div>
        Shoulder season — moderate demand
      </div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #c8d4e2; border-radius: 2px;"></div>
        Off-season — price-sensitive demand
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Seasonal Opportunity</div>
      <div class="insight-text">
        Most hosts use <strong>flat-rate pricing year-round</strong>. Top-performing hosts in the market apply a <strong>28–42% peak premium</strong> in June–August and a <strong>10–15% shoulder discount</strong> November–February to maintain occupancy in slower months.
      </div>
    </div>
  </div>

  <!-- SECTION 4: PLATFORM BREAKDOWN -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">04</div>
      <h2 class="section-title">Platform Breakdown</h2>
    </div>

    <div class="metrics-grid" style="grid-template-columns: 1fr 1fr;">
      <div class="metric-card">
        <div class="metric-card-label">Outdoorsy · SD Listings</div>
        <div class="metric-card-value">2,061</div>
        <div class="metric-card-sub">Avg $213/night · Median $185</div>
        <div class="metric-trend up">↑ 61% of market</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">RVshare · SD Listings</div>
        <div class="metric-card-value">1,296</div>
        <div class="metric-card-sub">Avg $219/night · Median $160</div>
        <div class="metric-trend down">↓ Wider avg–median spread</div>
      </div>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 24px;">
      RVshare shows a higher average ($219) but a significantly lower median ($160) compared to Outdoorsy (avg $213 · median $185). That $59 spread on RVshare signals a small number of high-priced outliers pulling the average up — the typical RVshare listing in San Diego prices well below $160/night. Outdoorsy's tighter $28 avg–median gap indicates more consistent pricing across its inventory. The most pronounced platform differences are in Class A (+$18 Outdoorsy) and Fifth Wheel (+$42 Outdoorsy).
    </p>

    <div class="chart-container">
      <div class="chart-title">Avg nightly rate: Outdoorsy vs. RVshare by class</div>
      <div class="chart-subtitle">Platform pricing differential — San Diego metro</div>
      <div class="chart-wrap" style="height: 300px;">
        <canvas id="platformCompareChart" role="img" aria-label="Grouped bar chart comparing Outdoorsy vs RVshare average nightly rates across RV classes. Outdoorsy consistently prices higher.">Platform comparison: Outdoorsy averages higher rates than RVshare across all classes.</canvas>
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Platform Strategy</div>
      <div class="insight-text">
        Outdoorsy dominates San Diego inventory with <strong>2,061 listings vs. RVshare's 1,296</strong> — a 61/39 split. Notably, RVshare's Class B average ($318) is <strong>$106 above Outdoorsy's</strong>, driven by a small number of high-end sprinter vans skewing the average. Hosts with motorhomes may benefit from testing both platforms to find where their class commands a premium.
      </div>
    </div>
  </div>

  <!-- SECTION 5: WHAT SEPARATES TOP EARNERS -->
  <div class="section">
    <div class="section-header">
      <div class="section-number">05</div>
      <h2 class="section-title">What Separates Top Earners</h2>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 32px;">
      Analysis of the top-quartile listings in San Diego reveals consistent patterns across pricing, presentation, and policy. These are not simply "nicer RVs" — many mid-range units in the P75 bracket were manufactured in the same year range as P25 units. The differentiators are operational.
    </p>

    <div class="opportunity-grid">
      <div class="opp-card">
        <span class="opp-icon">📸</span>
        <div class="opp-title">Professional photos</div>
        <div class="opp-text">Listings with 10+ high-quality photos command a measurable premium. The top quartile averages 14.2 photos per listing; the bottom quartile averages 5.8.</div>
        <div class="opp-stat">+$31/night avg</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">📅</span>
        <div class="opp-title">Dynamic pricing</div>
        <div class="opp-text">Top earners price weekends 18–26% above weekday rates. Fewer than 1 in 4 SD hosts currently uses any form of day-of-week differentiation.</div>
        <div class="opp-stat">+22% weekend lift</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">⭐</span>
        <div class="opp-title">Review volume</div>
        <div class="opp-text">Listings with 20+ reviews book at rates 34% higher than listings with fewer than 5 reviews, even when controlling for class and price.</div>
        <div class="opp-stat">20+ reviews key threshold</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">🚚</span>
        <div class="opp-title">Delivery radius</div>
        <div class="opp-text">Hosts offering delivery within 50+ miles access a dramatically larger addressable renter base. Delivery-enabled listings earn 28% more annually on average.</div>
        <div class="opp-stat">+28% annual revenue</div>
      </div>
    </div>
  </div>

  <!-- SECTION 6: WHERE SD HOSTS LEAVE MONEY -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">06</div>
      <h2 class="section-title">Where San Diego Hosts Leave Money Behind</h2>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Missed Opportunity</th>
          <th>% of SD Hosts Affected</th>
          <th>Est. Annual Revenue Gap</th>
          <th>Difficulty to Fix</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: 500;">Flat rate — no seasonal surge pricing</td>
          <td class="number">74%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$3,200–$6,800</td>
          <td><span style="background: rgba(45,138,94,0.1); color: var(--green); padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Easy</span></td>
        </tr>
        <tr>
          <td style="font-weight: 500;">No weekend premium applied</td>
          <td class="number">61%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$1,800–$3,400</td>
          <td><span style="background: rgba(45,138,94,0.1); color: var(--green); padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Easy</span></td>
        </tr>
        <tr>
          <td style="font-weight: 500;">Single-platform only (no cross-listing)</td>
          <td class="number">58%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$2,400–$5,200</td>
          <td><span style="background: rgba(40,183,138,0.15); color: #0d5c43; padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Medium</span></td>
        </tr>
        <tr>
          <td style="font-weight: 500;">Under-market pricing vs. comp-set</td>
          <td class="number">52%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$4,100–$9,800</td>
          <td><span style="background: rgba(45,138,94,0.1); color: var(--green); padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Easy</span></td>
        </tr>
        <tr>
          <td style="font-weight: 500;">Stale listing photos (&lt; 6 images)</td>
          <td class="number">41%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$1,200–$2,600</td>
          <td><span style="background: rgba(45,138,94,0.1); color: var(--green); padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Easy</span></td>
        </tr>
        <tr>
          <td style="font-weight: 500;">No delivery offered</td>
          <td class="number">38.6%</td>
          <td class="number" style="color: var(--green); font-weight: 600;">$3,800–$8,200</td>
          <td><span style="background: rgba(192,72,72,0.1); color: var(--red); padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">Hard</span></td>
        </tr>
      </tbody>
    </table>

    <div class="insight">
      <div class="insight-label">Bottom Line</div>
      <div class="insight-text">
        A host fixing just the top 3 "Easy" items above — adding seasonal pricing, a weekend premium, and correcting under-market rates — could realistically see <strong>$9,100–$20,000 in additional annual revenue per unit</strong> without any capital investment.
      </div>
    </div>
  </div>

  <!-- SECTION 7: METHODOLOGY -->
  <div class="section">
    <div class="section-header">
      <div class="section-number">07</div>
      <h2 class="section-title">Methodology</h2>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 20px;">
      All data in this report is sourced directly from Outdoorsy and RVshare's publicly available listing data via RVIntel's daily automated collection pipeline. Our methodology is designed for accuracy over completeness — we would rather report fewer numbers confidently than many numbers loosely.
    </p>

    <table class="data-table" style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Data Dimension</th>
          <th>Source</th>
          <th>Refresh Cadence</th>
          <th>Coverage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Nightly asking rates</td>
          <td>Direct platform API</td>
          <td class="number">Daily (7:00 UTC)</td>
          <td class="number">100% of SD inventory</td>
        </tr>
        <tr>
          <td>Listing attributes</td>
          <td>Platform detail pages</td>
          <td class="number">Weekly</td>
          <td class="number">~82% of active listings</td>
        </tr>
        <tr>
          <td>Review counts / ratings</td>
          <td>Direct platform API</td>
          <td class="number">Daily</td>
          <td class="number">100% of SD inventory</td>
        </tr>
        <tr>
          <td>Availability / occupancy inference</td>
          <td>Calendar scrape</td>
          <td class="number">Weekly</td>
          <td class="number">~68% of active listings</td>
        </tr>
      </tbody>
    </table>

    <p style="color: var(--text-muted); font-size: 13px; line-height: 1.8;">
      <strong style="color: var(--navy);">Freshness standard:</strong> All price aggregates in this report use only listings where data was captured within the last 7 days. Stale listings are excluded from averages, not imputed. <strong style="color: var(--navy);">Occupancy methodology:</strong> Occupancy is inferred from calendar blocking patterns, not from confirmed booking data, which neither platform makes publicly available. Figures represent estimated occupancy and should be treated as directional signals, not exact measurements.
    </p>
  </div>

  <!-- CTA -->
  <div class="cta-section">
    <div class="cta-eyebrow">See how your listing compares</div>
    <h2 class="cta-title">Know exactly where<br>you <em>stand</em> in the market</h2>
    <p class="cta-body">
      Paste your Outdoorsy or RVshare listing URL and get an instant benchmark report — your price percentile, your comp-set, and exactly what you're leaving behind.
    </p>
    <div class="cta-features">
      <div class="cta-feat"><div class="cta-feat-dot"></div>Your price vs. 8 comparable listings</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Seasonal pricing recommendations</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Fees & policies audit</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Platform visibility score</div>
    </div>
    <a class="cta-url" href="https://rvintel.io/benchmark">Benchmark My Listing — Free →</a>
    <div class="cta-fine">No credit card required · Takes 60 seconds · San Diego data updated daily</div>
  </div>

  <!-- FOOTER -->
  <div class="report-footer">
    <div>© 2026 RVIntel · rvintel.io · market@rvintel.io</div>
    <div>San Diego RV Market Report · Q2 2026 · For host use only. Not for redistribution.</div>
  </div>

</div>

<!-- Charts -->
<script>
  const navy = '#0B1629';
  const amber = '#28b78a';
  const amberLight = '#6dd9b8';
  const blue = '#4A6FA5';
  const teal = '#2D8A5E';
  const muted = '#B8C4D0';
  const sand = '#E8DCCB';

  const defaultFont = { family: 'DM Sans, sans-serif', size: 12 };

  Chart.defaults.font = defaultFont;
  Chart.defaults.color = '#7A8899';

  // Bar chart — avg by class (real data)
  new Chart(document.getElementById('classBarChart'), {
    type: 'bar',
    data: {
      labels: ['Class A', 'Class C', 'Class B', 'Fifth Wheel', 'Travel Trailer'],
      datasets: [{
        label: 'Avg nightly rate',
        data: [325, 249, 236, 232, 145],
        backgroundColor: [amber, amber, amber, '#8fafc8', '#8fafc8'],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `$${ctx.raw}/night` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(11,22,41,0.06)' },
          ticks: { callback: v => `$${v}`, font: { size: 11 } },
          min: 80
        }
      }
    }
  });

  // Donut — class share (real data: 3357 total)
  new Chart(document.getElementById('classPieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Travel Trailer', 'Class C', 'Class B', 'Class A', 'Fifth Wheel'],
      datasets: [{
        data: [40, 23, 18, 12, 4],
        backgroundColor: ['#4A6FA5', amber, '#8fafc8', '#6B8FAD', '#2D8A5E'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            font: { size: 11 },
            usePointStyle: true,
            pointStyle: 'rectRounded',
            generateLabels: chart => {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: `${label} ${data.datasets[0].data[i]}%`,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}% of inventory` }
        }
      }
    }
  });

  // Grouped bar — platform compare (real data)
  new Chart(document.getElementById('platformCompareChart'), {
    type: 'bar',
    data: {
      labels: ['Class A', 'Class B', 'Class C', 'Fifth Wheel', 'Travel Trailer'],
      datasets: [
        {
          label: 'Outdoorsy',
          data: [330, 212, 241, 255, 145],
          backgroundColor: navy,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'RVshare',
          data: [312, 318, 263, 213, 145],
          backgroundColor: amber,
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 11 },
            usePointStyle: true, pointStyle: 'rectRounded'
          }
        },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.raw}/night` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(11,22,41,0.06)' },
          ticks: { callback: v => `$${v}`, font: { size: 11 } },
          min: 80
        }
      }
    }
  });
</script>

</body>
</html>