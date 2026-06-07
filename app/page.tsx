import type { Metadata } from "next";
import { WaitlistPage } from "@/components/waitlist-page";
import {
  SITE_URL,
  SITE_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
} from "@/lib/site";

const HOME_TITLE = "RV Rental Market Intelligence for Hosts | RVIntel";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "RV Rental Market Intelligence for Hosts",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    type: "website",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1357,
        height: 861,
        alt: DEFAULT_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RV Rental Market Intelligence for Hosts",
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function HomePage() {
  return <WaitlistPage />;
}
