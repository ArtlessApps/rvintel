"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPreview } from "@/components/dashboard-preview";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

function HeroProductVisual() {
  return (
    <div className="relative w-full max-w-xl mx-auto lg:max-w-none">
      <div
        className="absolute -inset-3 sm:-inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-3xl blur-2xl opacity-70"
        aria-hidden
      />
      <figure className="relative bg-card rounded-2xl border border-border shadow-[0_12px_40px_rgba(25,28,30,0.06)] overflow-hidden">
        <figcaption className="sr-only">
          Product screenshot: RVIntel dashboard with pricing analytics and
          market positioning
        </figcaption>
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex gap-1.5" aria-hidden>
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <div className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
          <div className="flex-1 mx-4 min-w-0">
            <div className="bg-background rounded-md px-3 py-1.5 text-xs text-muted-foreground max-w-md mx-auto text-center truncate">
              app.rvintel.io/dashboard
            </div>
          </div>
        </div>
        <img
          src="/images/dashboard-preview.png"
          alt="RVIntel Market Positioning Dashboard showing pricing analytics, demand forecasting, and smart recommendations"
          className="w-full h-auto"
          width={1200}
          height={750}
        />
      </figure>
    </div>
  );
}

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-[20px] border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg text-foreground">
                RVIntel
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
              <a
                href="#preview"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Preview
              </a>
            </nav>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex"
              onClick={() => document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" })}
            >
              Join Waitlist
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Hero: value prop + primary CTA + prominent product visual (split layout) */}
        <section
          aria-labelledby="hero-heading"
          className="relative pt-28 pb-16 sm:pt-32 sm:pb-20 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid gap-12 lg:gap-14 lg:grid-cols-2 lg:items-center">
              <div className="flex flex-col justify-center text-center lg:text-left order-2 lg:order-1">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 mx-auto lg:mx-0 w-fit">
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
                  <span>Early Access Opening Soon</span>
                </div>

                <h1
                  id="hero-heading"
                  className="text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1] font-bold text-foreground tracking-tight text-balance mb-4"
                >
                  Stop Leaving Money on the Table
                </h1>

                <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-pretty max-w-xl mx-auto lg:mx-0 mb-8">
                  RV rental owners fly blind on pricing. RVIntel gives you the
                  market intelligence to know exactly what your rig should earn —
                  before you leave a single dollar behind.
                </p>

                <div id="waitlist" className="max-w-md mx-auto lg:mx-0 w-full">
                  {!submitted ? (
                    <form
                      onSubmit={handleSubmit}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="flex-1 h-12 bg-background border-border"
                      />
                      <Button
                        type="submit"
                        disabled={loading}
                        className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shrink-0"
                      >
                        {loading ? (
                          "Joining..."
                        ) : (
                          <>
                            Get Early Access
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-center lg:justify-start gap-3 p-4 bg-primary/10 rounded-xl">
                      <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                      <p className="text-foreground font-medium text-left">
                        {"You're on the list! We'll be in touch soon."}
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-4">
                    Join 500+ RV owners waiting for launch. No spam, ever.
                  </p>
                </div>
              </div>

              <div className="order-1 lg:order-2 min-w-0">
                <HeroProductVisual />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Market Intelligence That Pays for Itself
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Stop guessing. Start earning what your RV is actually worth.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: DollarSign,
                  title: "Dynamic Pricing Insights",
                  description:
                    "See real-time market rates for your RV class and location. Know exactly when to raise or lower your prices.",
                },
                {
                  icon: BarChart3,
                  title: "Demand Forecasting",
                  description:
                    "Predict booking windows, peak demand periods, and local events that drive rental prices up.",
                },
                {
                  icon: Zap,
                  title: "Smart Recommendations",
                  description:
                    "Get AI-powered suggestions to optimize your pricing strategy and maximize your annual revenue.",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group p-8 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live-style UI preview (distinct from hero screenshot — avoids repeating the same asset) */}
        <section
          id="preview"
          className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-card/50"
          aria-labelledby="preview-heading"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 max-w-2xl mx-auto">
              <h2
                id="preview-heading"
                className="text-3xl sm:text-4xl font-bold text-foreground mb-4"
              >
                Your Command Center for RV Revenue
              </h2>
              <p className="text-lg text-muted-foreground">
                Skim pacing, inventory, and alerts in one view — then drill into
                the numbers when you are ready to act.
              </p>
            </div>

            <div className="max-w-6xl mx-auto">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section
          className="py-20 px-4 sm:px-6 lg:px-8"
          aria-labelledby="final-cta-heading"
        >
          <div className="max-w-3xl mx-auto text-center">
            <h2
              id="final-cta-heading"
              className="text-3xl sm:text-4xl font-bold text-foreground mb-6"
            >
              Ready to Maximize Your RV Revenue?
            </h2>
            <p className="text-lg text-muted-foreground mb-10">
              Join the waitlist today and be first in line when we launch.
            </p>

            {!submitted ? (
              <form
                onSubmit={handleSubmit}
                className="max-w-md mx-auto flex flex-col sm:flex-row gap-3"
              >
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="flex-1 h-12 bg-card border-border"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  {loading ? (
                    "Joining..."
                  ) : (
                    <>
                      Join Waitlist
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="inline-flex items-center gap-3 p-4 bg-primary/10 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                <p className="text-foreground font-medium">
                  {"You're already on the list!"}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-medium text-foreground">RVIntel</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 RVIntel. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
