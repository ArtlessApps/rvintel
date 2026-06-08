"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { STRIPE_TRIAL_DAYS } from "@/lib/stripe-subscription";
import { cn } from "@/lib/utils";

const TRIAL_GRADIENT = { background: "linear-gradient(135deg, #006b5f, #2dd4bf)" };

type StartTrialCtaProps = {
  size?: "default" | "lg";
  className?: string;
  showSubtext?: boolean;
};

export function useTrialHref() {
  const { user } = useAuth();
  return user ? "/upgrade" : "/login?next=/upgrade";
}

export function StartTrialCta({
  size = "default",
  className,
  showSubtext = false,
}: StartTrialCtaProps) {
  const href = useTrialHref();
  const height = size === "lg" ? "h-12 px-8" : "h-11 px-6";

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        asChild
        className={cn("font-medium text-primary-foreground rounded-sm", height)}
        style={TRIAL_GRADIENT}
      >
        <Link href={href}>
          Start {STRIPE_TRIAL_DAYS}-day free trial
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
      {showSubtext ? (
        <p className="text-sm text-muted-foreground">
          Card required · From $9.99/mo after trial · Cancel anytime
        </p>
      ) : null}
    </div>
  );
}
