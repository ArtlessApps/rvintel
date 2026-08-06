"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProductCta } from "@/components/start-trial-cta";

type Props = {
  slug: string;
};

/** Only renders once resolveProductCta reports the visitor actually has dashboard access. */
export function DashboardCtaButton({ slug }: Props) {
  const cta = useProductCta();
  if (cta.variant !== "dashboard") return null;

  return (
    <Button
      asChild
      className="rounded-sm"
      style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
    >
      <Link href={`${cta.href}?market=${slug}`}>
        Open dashboard <ArrowRight className="w-4 h-4 ml-1" />
      </Link>
    </Button>
  );
}
