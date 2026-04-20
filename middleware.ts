import { NextResponse, type NextRequest } from "next/server";

// Tier 1 dashboard access gate.
//
// This is a visibility gate, not a data gate. The dashboard is a client
// component that queries Supabase directly with the anon key, so anyone with
// the anon key can still read `listings` via the REST API regardless of this
// middleware. The purpose of Tier 1 is to keep the dashboard URL out of casual
// visitors' reach while the waitlist is the primary funnel.
//
// Tier 2 (server-rendered dashboard + RLS lockdown) is the real data gate and
// is tracked in PRD §8 Access gating.
//
// Dev behavior: if DASHBOARD_ACCESS_SIGNATURE is unset, the gate is disabled
// and all traffic passes through. Mirrors the CRON_SECRET pattern in
// /api/scrape so local dev stays friction-free.

const COOKIE_NAME = "rvintel_access";

export function middleware(req: NextRequest) {
  const signature = process.env.DASHBOARD_ACCESS_SIGNATURE;
  if (!signature) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === signature) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/early-access";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
