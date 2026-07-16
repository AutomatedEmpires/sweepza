import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  buildContentSecurityPolicy,
  STRICT_TRANSPORT_SECURITY,
} from "@/lib/security-headers";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
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

  it("binds a nonce and 'strict-dynamic' to script-src in enforcing mode", () => {
    const policy = buildContentSecurityPolicy("abc123");
    const scriptSrc = policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("script-src"));
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Non-script directives are untouched by the nonce.
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("emits the identical report-only policy when no nonce is bound", () => {
    expect(buildContentSecurityPolicy()).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).not.toContain("nonce-");
    expect(CONTENT_SECURITY_POLICY).not.toContain("strict-dynamic");
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

  it("builds a BreadcrumbList with 1-indexed positions", () => {
    const crumbs = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://sweepza.com/" },
      { name: "Discover", url: "https://sweepza.com/discover" },
      { name: "Dream Cash", url: "https://sweepza.com/sweeps/dream-cash" },
    ]);
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement).toHaveLength(3);
    expect(crumbs.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(crumbs.itemListElement[2].position).toBe(3);
  });

  it("builds an ItemList of listing entries", () => {
    const list = buildItemListJsonLd([
      { name: "A", url: "https://sweepza.com/sweeps/a" },
      { name: "B", url: "https://sweepza.com/sweeps/b" },
    ]);
    expect(list["@type"]).toBe("ItemList");
    expect(list.itemListElement.map((e) => e.position)).toEqual([1, 2]);
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
