// app/learn/[slug]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// This ONE file powers all /learn article pages.
// Next.js sees the [slug] folder name and knows: "any URL that looks like
// /learn/something should use this file." It passes the 'something' part
// in as params.slug, and we use that to look up the right article.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, Tag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { POSTS, getPost, type Post } from "@/lib/posts";
import { JsonLd } from "@/lib/json-ld";
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
} from "@/lib/site";
import { STRIPE_TRIAL_DAYS, TRIAL_SUBTEXT } from "@/lib/stripe-subscription";

type Props = { params: Promise<{ slug: string }> };

// ── Pre-generate all article routes at build time ─────────────────────────────
// This tells Next.js "here are all the slugs that exist" so it can build
// static HTML pages for each one (better performance + SEO).
export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

// ── SEO metadata ──────────────────────────────────────────────────────────────
// This runs at build time for each article and fills in the <head> tags
// that Google and social platforms read (title, description, Open Graph).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: { absolute: "Not Found · RVIntel" } };

  const publishedTime = new Date(post.date).toISOString();

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `/learn/${slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime,
      siteName: SITE_NAME,
      url: `${SITE_URL}/learn/${slug}`,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1357,
          height: 861,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

function articleJsonLd(post: Post, slug: string) {
  const publishedTime = new Date(post.date).toISOString();

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: publishedTime,
    dateModified: publishedTime,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/apple-icon.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/learn/${slug}`,
    },
    image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
    articleSection: post.category,
  };
}

// ── Article Page ──────────────────────────────────────────────────────────────
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);

  // If the slug doesn't match any article, show Next.js's built-in 404 page
  if (!post) notFound();

  // Pull out the Content component so we can render it as <Content />
  const { Content } = post;

  // Pick 3 other articles to show as "Related Reading" at the bottom
  const related = POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={articleJsonLd(post, slug)} />
      <SiteHeader />

      <main className="pt-16">

        {/* ── Article Header ─────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-4">
          {/* Back button */}
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground transition-colors mb-10"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Learn
          </Link>

          <div className="max-w-2xl">
            {/* Category + read time pills */}
            <div className="flex items-center gap-3 mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium">
                <Tag className="w-2.5 h-2.5" />
                {post.category}
              </span>
              <span className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                {post.readTime}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-[2.25rem] sm:text-[3rem] font-semibold tracking-tight leading-tight mb-5">
              {post.title}
            </h1>

            {/* Excerpt / deck */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-xl">
              {post.excerpt}
            </p>

            <div className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground">
              {post.author}
            </div>
          </div>
        </section>

        {/* ── Gradient rule under the header ────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 mb-12">
          <div
            className="h-[2px] max-w-2xl"
            style={{
              background: "linear-gradient(90deg, #006b5f, #2dd4bf, transparent)",
            }}
          />
        </div>

        {/* ── Article Body ───────────────────────────────────────────────── */}
        {/* The long Tailwind class below uses the [&_tag]: syntax to style
            HTML elements *inside* the Content component without needing a
            separate CSS file. For example, [&_h2]: targets every <h2>
            inside this div. */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div
            className="
              max-w-2xl
              [&_h2]:text-[1.5rem]
              [&_h2]:font-semibold
              [&_h2]:tracking-tight
              [&_h2]:text-foreground
              [&_h2]:mt-10
              [&_h2]:mb-4
              [&_h2]:leading-tight
              [&_p]:text-sm
              [&_p]:text-muted-foreground
              [&_p]:leading-relaxed
              [&_p]:mb-5
              [&_ul]:mb-5
              [&_ul]:space-y-3
              [&_li]:text-sm
              [&_li]:text-muted-foreground
              [&_li]:leading-relaxed
              [&_li]:pl-4
              [&_strong]:text-foreground
              [&_strong]:font-medium
              [&_em]:italic
            "
          >
            <Content />
          </div>
        </section>

        {/* ── CTA Strip ─────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div
            className="max-w-2xl rounded-sm px-8 py-10"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,107,95,0.1), rgba(45,212,191,0.1))",
            }}
          >
            <div className="border-l-2 border-primary pl-6">
              <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium mb-2">
                See the data
              </p>
              <h2 className="text-[1.5rem] font-semibold tracking-tight mb-2">
                Benchmark your listing against the market
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                RVIntel&apos;s market dashboard shows current nightly rates, percentile
                breakdowns, and trend data for your RV class — updated from live
                platform data so you&apos;re never guessing.
              </p>
              <div className="space-y-2">
                <div className="flex gap-3 flex-wrap">
                  <Button
                    asChild
                    size="sm"
                    className="rounded-sm"
                    style={{
                      background: "linear-gradient(135deg, #006b5f, #2dd4bf)",
                    }}
                  >
                    <Link href="/login?next=/upgrade">
                      Start {STRIPE_TRIAL_DAYS}-day free trial
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                  >
                    <Link href="/markets">Browse market data</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="rounded-sm text-muted-foreground"
                  >
                    <Link href="/markets#expansion-waitlist">Expansion waitlist</Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{TRIAL_SUBTEXT}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Related Reading ────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <p className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground mb-6">
            Related Reading
          </p>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/learn/${r.slug}`}
                className="group block bg-muted/30 hover:bg-muted/50 rounded-sm p-5 transition-colors"
              >
                {/* The little gradient accent bar at the top of each card */}
                <div
                  className="h-0.5 w-full mb-4"
                  style={{
                    background: "linear-gradient(90deg, #006b5f, #2dd4bf)",
                  }}
                />
                <span className="text-[0.625rem] uppercase tracking-[0.05em] text-primary font-medium block mb-2">
                  {r.category}
                </span>
                <p className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                  {r.title}
                </p>
              </Link>
            ))}
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}
