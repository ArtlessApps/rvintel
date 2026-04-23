"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (otpError) {
      setError(otpError.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/RVIntel logo Light.png"
              alt="RVIntel"
              width={600}
              height={600}
              className="h-32 w-auto block dark:hidden"
            />
            <Image
              src="/RVIntel logo Dark.png"
              alt="RVIntel"
              width={600}
              height={600}
              className="h-32 w-auto hidden dark:block"
            />
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-primary/10 mb-6">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight mb-2">
              Check your email
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              We sent a magic link to{" "}
              <span className="text-foreground font-medium">{email}</span>.
              Click it to sign in — the link expires in 1 hour.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(""); }}
              className="text-sm text-primary hover:underline"
            >
              Use a different email
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/RVIntel logo Light.png"
            alt="RVIntel"
            width={600}
            height={600}
            className="h-32 w-auto block dark:hidden"
          />
          <Image
            src="/RVIntel logo Dark.png"
            alt="RVIntel"
            width={600}
            height={600}
            className="h-32 w-auto hidden dark:block"
          />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              <Mail className="w-3 h-3" />
              Sign in
            </div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a magic link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground"
              >
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="rounded-sm h-10"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-sm h-10"
              style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
            >
              {loading ? "Sending…" : "Send magic link"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            Don&apos;t have access?{" "}
            <Link href="/#waitlist" className="text-primary hover:underline">
              Join the waitlist
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
