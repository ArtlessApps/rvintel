import Link from "next/link";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/learn", label: "Learn" },
  { href: "/upgrade", label: "Pricing" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              RV rental market intelligence across 33 US markets.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-2" aria-label="Footer navigation">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            © 2026 RVIntel. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
