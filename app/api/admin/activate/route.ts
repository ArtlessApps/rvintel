// A protected admin route you call once per waitlist user.
// It generates a magic login link and sets their free trial in the DB.

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

  const { email, trial_days = 14 } = await request.json();

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

  const trialEndsAt = new Date(
    Date.now() + trial_days * 24 * 60 * 60 * 1000
  ).toISOString();

  await supabaseAdmin.from("user_profiles").upsert({
    id: linkData.user.id,
    email,
    subscription_tier: "trial",
    subscription_status: "trialing",
    trial_ends_at: trialEndsAt,
    activated_from_waitlist: true,
  });

  return NextResponse.json({
    success: true,
    user_id: linkData.user.id,
    trial_ends_at: trialEndsAt,
    message: `Trial set for ${trial_days} days (expires ${trialEndsAt})`,
    magic_link: linkData.properties.action_link,
  });
}
