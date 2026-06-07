import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const baseUrl = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/login", "/early-access", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
