// app/sitemap.ts
// ─────────────────────────────────────────────────────────────────────────────
// This file tells Google (and other search engines) every URL that exists
// on your site. Next.js automatically serves it at /sitemap.xml.
// Added all 6 /learn article URLs so they get crawled and indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { MetadataRoute } from "next";
import { POSTS } from "@/lib/posts";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvintel.io";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core pages ────────────────────────────────────────────────────────────
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/early-access`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/markets`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/markets/san-diego`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/markets/riverside-county`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.85,
    },

    // ── Learn articles ────────────────────────────────────────────────────────
    ...POSTS.map((post) => ({
      url: `${baseUrl}/learn/${post.slug}`,
      lastModified: new Date("2026-06-06"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}