"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "rvintel_access";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Only allow local-relative paths through as the post-login redirect target.
// Rejects protocol-relative ("//evil.com") and backslash-prefixed paths that
// some browsers normalize into cross-origin navigations.
function sanitizeNext(raw: string): string {
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function submitAccessCode(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const next = sanitizeNext(String(formData.get("next") ?? "/dashboard"));

  const expected = process.env.DASHBOARD_ACCESS_CODE;
  const signature = process.env.DASHBOARD_ACCESS_SIGNATURE;

  // Gate is not configured — mirror the middleware's dev-open posture.
  if (!expected || !signature) {
    redirect(next);
  }

  if (code !== expected) {
    const qs = new URLSearchParams({ next, error: "1" }).toString();
    redirect(`/early-access?${qs}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signature, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  redirect(next);
}
