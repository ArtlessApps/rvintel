// A protected admin route for waitlist activation.
// Generates a magic login link. Optional trial_days grants legacy manual access
// (for waitlist VIPs you handle separately). Self-serve users get a 7-day Stripe
// trial when they pick a plan on /upgrade.

import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, trial_days } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (linkError || !linkData.user) {
    return NextResponse.json({ error: linkError?.message ?? "Failed to generate link" }, { status: 500 });
  }

  const profile: Record<string, unknown> = {
    id: linkData.user.id,
    email,
    activated_from_waitlist: true,
  };

  let trialEndsAt: string | undefined;
  if (typeof trial_days === "number" && trial_days > 0) {
    trialEndsAt = new Date(
      Date.now() + trial_days * 24 * 60 * 60 * 1000
    ).toISOString();
    profile.subscription_tier = "trial";
    profile.subscription_status = "trialing";
    profile.trial_ends_at = trialEndsAt;
  }

  await supabaseAdmin.from("user_profiles").upsert(profile);

  return NextResponse.json({
    success: true,
    user_id: linkData.user.id,
    trial_ends_at: trialEndsAt ?? null,
    message: trialEndsAt
      ? `Waitlist trial set for ${trial_days} days (expires ${trialEndsAt})`
      : "Waitlist user activated — they can sign in and start a plan trial on /upgrade",
    magic_link: linkData.properties.action_link,
  });
}
