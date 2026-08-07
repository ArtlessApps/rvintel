/**
 * Learn article → market page cross-links for internal link depth.
 * Slugs must exist in lib/markets.ts and be live.
 */
export const POST_RELATED_MARKETS: Record<string, string[]> = {
  // Pricing cluster
  "dynamic-pricing-101": ["san-diego-ca", "los-angeles-ca", "seattle-wa"],
  "peak-season-playbook": ["phoenix-az", "orlando-fl", "denver-co"],
  "comp-analysis": ["san-diego-ca", "los-angeles-ca", "austin-tx"],
  "weekly-vs-nightly": ["portland-or", "seattle-wa", "san-diego-ca"],
  "reviews-revenue": ["denver-co", "austin-tx", "philadelphia-pa"],
  "platform-comparison": ["los-angeles-ca", "phoenix-az", "seattle-wa"],
  // Business cluster
  "how-to-start-rv-rental-business": ["san-diego-ca", "austin-tx", "denver-co"],
  "rv-rental-listing-optimization": ["los-angeles-ca", "orlando-fl", "seattle-wa"],
  "rv-rental-agreement-guide": ["phoenix-az", "dallas-fort-worth-tx", "atlanta-ga"],
  "rv-rental-operations-playbook": ["portland-or", "tampa-fl", "minneapolis-mn"],
  "increase-rv-rental-profit": ["san-diego-ca", "denver-co", "orange-county-ca"],
  "long-term-rv-rentals": ["phoenix-az", "austin-tx", "tampa-fl"],
  "rv-rental-forms-templates": ["seattle-wa", "atlanta-ga", "san-antonio-tx"],
};

export function relatedMarketsForPost(slug: string): string[] {
  return POST_RELATED_MARKETS[slug] ?? [];
}
