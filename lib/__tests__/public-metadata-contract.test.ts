import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicPageMetadata, SITE_OG_IMAGE } from "@/lib/page-metadata";
import sitemap from "@/app/sitemap";

/**
 * Next merges `openGraph` shallowly. A route that declares its own block
 * replaces the parent's and does NOT inherit the app/opengraph-image.tsx card,
 * so every such route silently shipped with no og:image and a downgraded
 * twitter:card. Nothing in the app looks broken when this regresses — it is
 * only visible when someone shares a link — so the contract is asserted here.
 */
const ROUTES_WITH_OWN_OPENGRAPH = [
  "app/about/page.tsx",
  "app/cookies/page.tsx",
  "app/discover/page.tsx",
  "app/discover/[category]/page.tsx",
  "app/faq/page.tsx",
  "app/host/page.tsx",
  "app/my-sweeps/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/winners/page.tsx",
];

describe("public metadata contract", () => {
  it("attaches the site card and a large twitter card", () => {
    const meta = publicPageMetadata({
      title: "Discover",
      description: "d",
      path: "/discover",
    });

    expect(meta.openGraph?.images).toEqual([SITE_OG_IMAGE]);
    // Metadata["twitter"] is a union; only the summary_large_image member
    // carries the card we require, so narrow rather than cast.
    expect(meta.twitter && "card" in meta.twitter && meta.twitter.card).toBe(
      "summary_large_image",
    );
    expect(meta.alternates?.canonical).toBe("/discover");
  });

  it("lets a route override only the social title and description", () => {
    const meta = publicPageMetadata({
      title: "Winners",
      description: "page description",
      path: "/winners",
      ogTitle: "Winner Wall",
      ogDescription: "Stories from recent winners",
    });

    expect(meta.title).toBe("Winners");
    expect(meta.description).toBe("page description");
    expect(meta.openGraph?.title).toBe("Winner Wall");
    expect(meta.openGraph?.description).toBe("Stories from recent winners");
    expect(
      meta.twitter && "description" in meta.twitter && meta.twitter.description,
    ).toBe("Stories from recent winners");
    expect(meta.openGraph?.images).toEqual([SITE_OG_IMAGE]);
  });

  it("yields to a route's own opengraph-image when asked", () => {
    const meta = publicPageMetadata({
      title: "Cash sweepstakes",
      description: "d",
      path: "/discover/cash",
      useRouteImage: true,
    });

    // Naming the site image here would replace the per-hub card that
    // app/discover/[category]/opengraph-image.tsx renders.
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).not.toHaveProperty("images");
    expect(meta.alternates?.canonical).toBe("/discover/cash");
  });

  it("keeps the per-hub category card wired to the route image", () => {
    const src = readFileSync(
      join(process.cwd(), "app/discover/[category]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("useRouteImage: true");
  });

  it("routes that declare openGraph build it through the shared helper", () => {
    const offenders: string[] = [];
    for (const route of ROUTES_WITH_OWN_OPENGRAPH) {
      const src = readFileSync(join(process.cwd(), route), "utf8");
      if (!src.includes("publicPageMetadata(")) {
        offenders.push(`${route}: does not use publicPageMetadata`);
        continue;
      }
      // A hand-written openGraph block is exactly what drops the card.
      if (/openGraph:\s*\{/.test(src)) {
        offenders.push(`${route}: hand-writes an openGraph block`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the homepage canonical", () => {
    const src = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    expect(src).toContain('canonical: "/"');
  });

  it("never sitemaps a noindex route", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).not.toContain("https://sweepza.com/my-sweeps");
    expect(urls).toContain("https://sweepza.com/discover");
    expect(urls).toContain("https://sweepza.com/winners");
  });

  it("does not restamp static sitemap entries on every crawl", async () => {
    const first = await sitemap();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await sitemap();

    const staticEntry = (entries: Awaited<ReturnType<typeof sitemap>>) =>
      entries.find((entry) => entry.url === "https://sweepza.com/about");

    expect(staticEntry(first)?.lastModified).toEqual(
      staticEntry(second)?.lastModified,
    );
  });
});
