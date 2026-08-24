import type { MetadataRoute } from "next";
import { liveMarkets } from "@/lib/markets";
import { POST_SITEMAP_ENTRIES } from "@/lib/post-slugs";

import { SITE_URL } from "@/lib/site";

const baseUrl = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const markets = liveMarkets();

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/tools/roi-calculator`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/markets`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...markets.map((market) => ({
      url: `${baseUrl}/markets/${market.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
    ...POST_SITEMAP_ENTRIES.map((post) => ({
      url: `${baseUrl}/learn/${post.slug}`,
      lastModified: new Date(post.lastModified),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
