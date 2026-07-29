import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("Sweepza brand and public shell", () => {
  it("uses the modern sans system and auth-aware public shell", () => {
    const layout = source("app/layout.tsx");

    expect(layout).toContain('import localFont from "next/font/local"');
    expect(layout).toContain("@fontsource-variable/manrope");
    expect(layout).toContain("<PublicShell>{children}</PublicShell>");
    expect(layout).not.toMatch(/\bFraunces\b/);
  });

  it("uses the approved optimized casino hero without changing the structured-data mark", async () => {
    const runtimeSources = [
      source("app/page.tsx"),
      source("app/layout.tsx"),
      source("lib/structured-data.ts"),
      source("app/opengraph-image.tsx"),
    ].join("\n");

    expect(runtimeSources).toContain("/brand/sweepza-casino-hero.webp");
    expect(runtimeSources).not.toContain("sweepza-logo.png");
    expect(runtimeSources).not.toContain("Gemini_Generated_Image");
    expect(source("lib/structured-data.ts")).toContain(
      "/brand/sweepza-mark.svg",
    );

    const heroPath = join(root, "public/brand/sweepza-casino-hero.webp");
    const metadata = await sharp(heroPath).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(2400);
    expect(metadata.height).toBe(1018);
    expect(statSync(heroPath).size).toBeLessThan(500_000);
  });

  it("keeps the public navigation focused on discovery and trust", () => {
    const header = source("components/public-header.tsx");
    const footer = source("components/public-footer.tsx");

    for (const label of [
      "Today",
      "Discover",
      "My sweeps",
      "Winners",
      "Profile",
      "For sponsors",
    ]) {
      expect(header).toContain(label);
    }
    expect(footer).toContain("not by Sweepza");
    expect(footer).toContain("official rules");
  });
});
