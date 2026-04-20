import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitAccessCode } from "./actions";

export const metadata = {
  title: "Early Access · RVIntel",
  description: "Enter your invite code to preview the RVIntel dashboard.",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

function sanitizeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export default async function EarlyAccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);
  const hasError = params.error === "1";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">RVIntel</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              Early Access
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
              Enter your access code
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The dashboard is invite-only while we calibrate coverage.
              Your code was included with your waitlist confirmation.
            </p>
          </div>

          <form action={submitAccessCode} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <Input
              name="code"
              type="text"
              autoComplete="off"
              autoFocus
              required
              placeholder="Access code"
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? "access-error" : undefined}
              className="h-11 text-base"
            />
            {hasError ? (
              <p
                id="access-error"
                className="text-xs text-destructive px-1"
                role="alert"
              >
                That code didn&apos;t match. Double-check your invite email, or{" "}
                <Link href="/" className="underline underline-offset-2">
                  request access
                </Link>
                .
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full">
              Continue to dashboard
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Not on the list yet?{" "}
            <Link
              href="/"
              className="text-foreground underline underline-offset-4"
            >
              Join the waitlist
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
