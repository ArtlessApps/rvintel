// Stripe redirects here after successful checkout.
// Verifies the session, updates user_profiles, then sends the user to the dashboard.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function tierForPriceId(priceId: string): string {
  const map: Record<string, string | undefined> = {
    [process.env.STRIPE_PRICE_ID_SOLO ?? ""]: "solo",
    [process.env.STRIPE_PRICE_ID_GROWTH ?? ""]: "growth",
    [process.env.STRIPE_PRICE_ID_FLEET ?? ""]: "fleet",
  };
  return map[priceId] ?? "solo";
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

export async function GET(request: NextRequest) {
  const stripe = getStripe();
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/upgrade`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/login`);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (
      session.payment_status !== "paid" ||
      session.metadata?.supabase_uid !== user.id
    ) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/upgrade`);
    }

    if (session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const tier = tierForPriceId(priceId);

      await supabaseAdmin
        .from("user_profiles")
        .update({
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          subscription_tier: sub.status === "active" ? tier : "none",
          current_period_end: subscriptionPeriodEnd(sub),
        })
        .eq("id", user.id);
    }
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/upgrade`);
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?subscribed=1`);
}
