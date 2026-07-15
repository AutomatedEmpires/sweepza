import { APP_DESCRIPTION, APP_NAME, APP_URL, SITE_URL } from "@/lib/site";
import type { FaqItem } from "@/lib/faq";

// Site-level JSON-LD builders — the safe, truthful schema.org types for a
// sweepstakes directory. Deliberately NOT Event (sweepstakes don't meet
// Google's Event eligibility). Rendered with serializeJsonLd from listing-seo.

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: SITE_URL.toString(),
    description: APP_DESCRIPTION,
    logo: `${APP_URL}/icon.svg`,
  };
}

/** WebSite + a SearchAction so search engines can offer a sitelinks search box. */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: SITE_URL.toString(),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${APP_URL}/discover?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
