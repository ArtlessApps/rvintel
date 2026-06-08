// This file wraps every page under /dashboard and runs server-side before they load.
// If the user's trial has expired and they have no active subscription,
// they get bounced to /upgrade. Your existing dashboard/page.tsx doesn't change.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasActiveAccess } from "@/lib/subscription";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  // Build a Supabase client using the user's browser session cookie.
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

  // Make sure the user is logged in (proxy.ts also does this, but belt-and-suspenders).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch their subscription profile from the DB.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("subscription_tier, subscription_status, trial_ends_at, current_period_end")
    .eq("id", user.id)
    .single();

  // If they don't have a valid trial or subscription, send them to the upgrade page.
  if (!hasActiveAccess(profile)) {
    redirect(profile ? "/upgrade?expired=1" : "/upgrade");
  }

  // User has access — render the dashboard page normally.
  return <>{children}</>;
}
