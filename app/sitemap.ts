import { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rvintel.io'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/early-access`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/markets`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]
}
