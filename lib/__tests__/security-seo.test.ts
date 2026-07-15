import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  STRICT_TRANSPORT_SECURITY,
} from "@/lib/security-headers";
import {
  buildFaqJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structured-data";
import { FAQ_ITEMS } from "@/lib/faq";

describe("content security policy", () => {
  it("locks down the dangerous defaults", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
  });

  it("keeps script-src free of 'unsafe-inline' (report-only target policy)", () => {
    const scriptSrc = CONTENT_SECURITY_POLICY.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("allowlists the runtime providers for connect-src", () => {
    for (const host of ["*.supabase.co", "*.posthog.com", "*.clerk.com", "api.stripe.com", "*.sentry.io"]) {
      expect(CONTENT_SECURITY_POLICY).toContain(host);
    }
  });

  it("sets a long HSTS max-age without preload", () => {
    expect(STRICT_TRANSPORT_SECURITY).toContain("max-age=63072000");
    expect(STRICT_TRANSPORT_SECURITY).toContain("includeSubDomains");
    expect(STRICT_TRANSPORT_SECURITY).not.toContain("preload");
  });
});

describe("structured data", () => {
  it("emits an Organization node", () => {
    const org = buildOrganizationJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("Sweepza");
    expect(org.url).toMatch(/^https?:\/\//);
  });

  it("emits a WebSite with a SearchAction pointing at discover", () => {
    const site = buildWebSiteJsonLd();
    expect(site["@type"]).toBe("WebSite");
    expect(site.potentialAction["@type"]).toBe("SearchAction");
    expect(site.potentialAction.target.urlTemplate).toContain("/discover?q={search_term_string}");
    expect(site.potentialAction["query-input"]).toBe("required name=search_term_string");
  });

  it("builds a FAQPage from every FAQ item", () => {
    const faq = buildFaqJsonLd(FAQ_ITEMS);
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(FAQ_ITEMS.length);
    expect(faq.mainEntity[0]).toMatchObject({
      "@type": "Question",
      acceptedAnswer: { "@type": "Answer" },
    });
  });

  it("keeps FAQ answers non-empty and canon-aligned", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(FAQ_ITEMS.every((i) => i.question.length > 0 && i.answer.length > 0)).toBe(true);
    // The no-purchase-necessary promise must be stated somewhere.
    expect(FAQ_ITEMS.some((i) => /no purchase/i.test(i.answer))).toBe(true);
  });
});
