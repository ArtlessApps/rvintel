// app/learn/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The /learn listing page. Two changes from the original:
//   1. POSTS now imported from lib/posts (single source of truth)
//   2. Each article card is wrapped in a <Link> so it's clickable
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { BookOpen, Clock, ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { POSTS } from "@/lib/posts";

export const metadata = {
  title: "Learn · RVIntel",
  description:
    "Guides, strategy, and market insights to help RV rental hosts price smarter and earn more.",
};

const CATEGORIES = [
  "All",
  "Pricing Strategy",
  "Seasonal Trends",
  "Market Analysis",
  "Host Growth",
];

export default function LearnPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-16">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              <BookOpen className="w-3 h-3" />
              Host Education
            </div>
            <h1 className="text-[3.5rem] font-semibold tracking-tight leading-none mb-4">
              The Learning Hub
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              Data-driven guides for RV rental hosts who want to price smarter,
              understand their market, and grow their income.
            </p>
          </div>
        </section>

        {/* Category filter (static display — active filtering can be wired in later) */}
        <section className="border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-1 overflow-x-auto pb-px">
              {CATEGORIES.map((cat, i) => (
                <div
                  key={cat}
                  className={`flex items-center gap-1.5 px-3 py-3 text-[0.6875rem] uppercase tracking-[0.05em] font-medium whitespace-nowrap border-b-2 transition-colors ${
                    i === 0
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                >
                  {i > 0 && <Tag className="w-2.5 h-2.5" />}
                  {cat}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Post grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {POSTS.map((post) => (
              // Wrap the entire card in a Link so clicking anywhere opens the article
              <Link
                key={post.slug}
                href={`/learn/${post.slug}`}
                className="group flex flex-col bg-muted/30 hover:bg-muted/50 rounded-sm overflow-hidden transition-colors"
              >
                {/* Gradient accent bar at the top of each card */}
                <div
                  className="h-1 w-full"
                  style={{
                    background: "linear-gradient(90deg, #006b5f, #2dd4bf)",
                  }}
                />
                <div className="flex flex-col flex-1 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
                      {post.category}
                    </span>
                    <span className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-[1.5rem] font-semibold tracking-tight leading-tight mb-3">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {post.excerpt}
                  </p>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                      {post.date}
                    </span>
                    {/* "Read" arrow — visible on hover */}
                    <span className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Read <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-sm bg-muted/40 px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-[1.5rem] font-semibold tracking-tight mb-1">
                Get new guides in your inbox
              </h2>
              <p className="text-sm text-muted-foreground">
                Join waitlist members who get early access to market reports and
                strategy guides.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="shrink-0 rounded-sm"
              style={{
                background: "linear-gradient(135deg, #006b5f, #2dd4bf)",
              }}
            >
              <Link href="/#waitlist">Join the Waitlist</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}