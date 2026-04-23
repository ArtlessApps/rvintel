import Link from "next/link";
import Image from "next/image";
import { BookOpen, Clock, ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Learn · RVIntel",
  description:
    "Guides, strategy, and market insights to help RV rental hosts price smarter and earn more.",
};

const POSTS = [
  {
    slug: "dynamic-pricing-101",
    category: "Pricing Strategy",
    title: "Dynamic Pricing 101 for RV Rental Hosts",
    excerpt:
      "Most hosts set a rate and forget it. Here's how market-responsive pricing can boost revenue by 20–40% without sacrificing occupancy.",
    readTime: "6 min read",
    date: "Coming soon",
  },
  {
    slug: "peak-season-playbook",
    category: "Seasonal Trends",
    title: "The Peak Season Playbook: When to Raise Rates (and When Not To)",
    excerpt:
      "Demand peaks are predictable. We break down the data behind holiday weekends, school breaks, and festival corridors.",
    readTime: "8 min read",
    date: "Coming soon",
  },
  {
    slug: "comp-analysis",
    category: "Market Analysis",
    title: "How to Read a Competitive Landscape: A Host's Guide",
    excerpt:
      "Understanding what your neighbors charge — and why — is the fastest path to better positioning.",
    readTime: "5 min read",
    date: "Coming soon",
  },
  {
    slug: "weekly-vs-nightly",
    category: "Pricing Strategy",
    title: "Weekly vs. Nightly Rates: Finding the Right Ratio",
    excerpt:
      "The discount you offer for weekly bookings directly shapes your calendar density and total yield.",
    readTime: "4 min read",
    date: "Coming soon",
  },
  {
    slug: "reviews-revenue",
    category: "Host Growth",
    title: "The Reviews–Revenue Loop: Why Ratings Drive More Than Clicks",
    excerpt:
      "A half-star increase in average rating correlates with a measurable nightly rate premium. Here's the data.",
    readTime: "7 min read",
    date: "Coming soon",
  },
  {
    slug: "platform-comparison",
    category: "Market Analysis",
    title: "RVshare vs. Outdoorsy vs. Hipcamp: Where Should You List?",
    excerpt:
      "Cross-platform rate data reveals meaningful pricing differences by vehicle type and region.",
    readTime: "9 min read",
    date: "Coming soon",
  },
];

const CATEGORIES = ["All", "Pricing Strategy", "Seasonal Trends", "Market Analysis", "Host Growth"];

export default function LearnPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-[20px] border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <Image
                src="/RVIntel logo Light.png"
                alt="RVIntel"
                width={600}
                height={600}
                className="h-40 w-auto block dark:hidden"
              />
              <Image
                src="/RVIntel logo Dark.png"
                alt="RVIntel"
                width={600}
                height={600}
                className="h-40 w-auto hidden dark:block"
              />
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="/#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="/markets"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Markets
              </Link>
              <Link
                href="/learn"
                className="text-sm text-foreground font-medium"
              >
                Learn
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            </nav>
            <Button variant="outline" size="sm" className="hidden sm:flex" asChild>
              <Link href="/#waitlist">Join Waitlist</Link>
            </Button>
          </div>
        </div>
      </header>

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
              Data-driven guides for RV rental hosts who want to price smarter, understand their market, and grow their income.
            </p>
          </div>
        </section>

        {/* Category filter (static display for now) */}
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
              <article
                key={post.slug}
                className="group flex flex-col bg-muted/30 hover:bg-muted/50 rounded-sm overflow-hidden transition-colors"
              >
                {/* Color band */}
                <div
                  className="h-1 w-full"
                  style={{ background: "linear-gradient(90deg, #006b5f, #2dd4bf)" }}
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
                    <span className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Read <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </article>
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
                Join waitlist members who get early access to market reports and strategy guides.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="shrink-0 rounded-sm"
              style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
            >
              <Link href="/#waitlist">Join the Waitlist</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
