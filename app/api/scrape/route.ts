import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    message: "Scrape job queued. Firecrawl integration coming soon.",
    timestamp: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Scrape API endpoint is live. Use POST to trigger a scrape job.",
    timestamp: new Date().toISOString(),
  });
}
