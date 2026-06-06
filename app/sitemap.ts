import { MetadataRoute } from "next";
import { liveMarkets } from "@/lib/markets";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvintel.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/early-access`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/learn`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/markets`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/dashboard`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
  ];

  const marketRoutes: MetadataRoute.Sitemap = liveMarkets().map((m) => ({
    url: `${baseUrl}/markets/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...marketRoutes];
}
