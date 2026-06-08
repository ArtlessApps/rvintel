"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { resolveProductCta } from "@/lib/product-cta";
import { cn } from "@/lib/utils";

const TRIAL_GRADIENT = { background: "linear-gradient(135deg, #006b5f, #2dd4bf)" };

type StartTrialCtaProps = {
  size?: "default" | "lg" | "sm";
  className?: string;
  showSubtext?: boolean;
};

export function useProductCta() {
  const { user, profile } = useAuth();
  return useMemo(() => resolveProductCta(user, profile), [user, profile]);
}

/** @deprecated Use useProductCta().href */
export function useTrialHref() {
  return useProductCta().href;
}

export function StartTrialCta({
  size = "default",
  className,
  showSubtext = false,
}: StartTrialCtaProps) {
  const cta = useProductCta();
  const height =
    size === "lg" ? "h-12 px-8" : size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-6";

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        asChild
        className={cn("font-medium text-primary-foreground rounded-sm", height)}
        style={TRIAL_GRADIENT}
      >
        <Link href={cta.href}>
          {cta.label}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
      {showSubtext && cta.subtext ? (
        <p className="text-sm text-muted-foreground">{cta.subtext}</p>
      ) : null}
    </div>
  );
}
