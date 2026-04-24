import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  /** Tailwind height utility (e.g. "h-8", "h-10"). Defaults to "h-8" — standard header size. */
  height?: string;
  className?: string;
  priority?: boolean;
};

/**
 * RVIntel wordmark. Single source of truth for logo sizing and
 * light/dark variants. Intrinsic aspect ratio is ~4.08:1.
 */
export function Logo({ height = "h-8", className, priority }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/RVIntel logo Light.png"
        alt="RVIntel"
        width={858}
        height={210}
        priority={priority}
        className={cn(height, "w-auto block dark:hidden")}
      />
      <Image
        src="/RVIntel logo Dark.png"
        alt="RVIntel"
        width={858}
        height={210}
        priority={priority}
        className={cn(height, "w-auto hidden dark:block")}
      />
    </span>
  );
}
