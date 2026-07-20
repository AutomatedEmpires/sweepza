import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/site";

// Crawl policy: public catalog and editorial pages are open; operational and
// app-shell surfaces are excluded so crawl budget concentrates on listings.
//  - /admin, /api        : private/operational, never index.
//  - /visual-review      : internal design-review fixtures — indexing it would
//                          put fake listings into search results.
//  - /sign-in, /sign-up  : auth shells with no standalone content.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/visual-review",
        "/sign-in",
        "/sign-up",
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
