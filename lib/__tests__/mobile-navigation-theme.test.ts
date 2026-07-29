import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLORS } from "@/lib/generated/theme-colors";
import { buildThemeColors } from "../../scripts/theme-colors-lib.mjs";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("mobile navigation and jewel theme", () => {
  it("pins the canonical consumer navigation for public and signed-in shells", () => {
    const bottomNav = source("components/bottom-nav.tsx");
    const publicShell = source("components/public-shell.tsx");
    const mobileShell = source("components/mobile-shell.tsx");

    expect(bottomNav).toContain('aria-label="Primary"');
    expect(bottomNav).toContain("fixed inset-x-0 bottom-0");
    expect(bottomNav).toContain("z-[var(--z-nav)]");
    expect(bottomNav).toContain("env(safe-area-inset-bottom)");
    expect(bottomNav).toContain("min-h-14");
    expect(bottomNav).toContain("CONSUMER_NAV_ITEMS.map");

    expect(publicShell).toContain(
      'import { BottomNav } from "@/components/bottom-nav"',
    );
    expect(publicShell).toContain("<BottomNav />");
    expect(publicShell).toContain(
      "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
    );

    expect(mobileShell).toContain("<BottomNav />");
    expect(mobileShell).toContain(
      "max-w-md flex-col sm:max-w-2xl md:max-w-3xl",
    );
    expect(mobileShell).toContain(
      "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("uses the bottom navigation instead of a second mobile navigation menu", () => {
    const header = source("components/public-header.tsx");

    expect(header).not.toContain("<details");
    expect(header).not.toContain("Mobile public navigation");
    expect(header).toContain("Create a free Sweepza account");
    expect(header).toContain("min-h-11");
    expect(header).toContain("lg:hidden");
  });

  it("defaults every first-paint surface to Midnight while preserving explicit light mode", () => {
    const tokens = source("app/tokens.css");
    const layout = source("app/layout.tsx");
    const theme = source("lib/theme.tsx");
    const manifest = source("app/manifest.ts");
    const ogTheme = source("lib/og-theme.tsx");
    const listingOg = source("app/api/og/sweeps/[slug]/route.tsx");
    const icon = source("app/icon.svg");

    expect(tokens).not.toContain("--sun-ember: 190 64 50");

    expect(THEME_COLORS).toEqual(buildThemeColors(tokens));

    expect(layout).toContain("THEME_COLORS.sunrise.paper");
    expect(layout).toContain("THEME_COLORS.midnight.paper");
    expect(layout).toContain("data-sweepza-theme-color");
    expect(layout).toContain("data-sweepza-sunrise");
    expect(layout).toContain("data-sweepza-midnight");
    expect(layout).toContain('data-theme="dark"');
    expect(layout).toContain("var r='dark'");
    expect(layout).toContain(
      "localStorage.getItem('sweepza-theme')==='light'",
    );
    expect(layout).not.toContain("getHours()");
    expect(layout).not.toContain("JSON.stringify");
    expect(layout).not.toContain("prefers-color-scheme");
    expect(theme).toContain('meta[data-sweepza-theme-color]');
    expect(theme).toContain("THEME_COLORS.midnight.paper");
    expect(theme).toContain("THEME_COLORS.sunrise.paper");
    expect(theme).toContain('useState<ThemePreference>("dark")');
    expect(theme).not.toContain('"auto" | "light" | "dark"');
    expect(manifest).toContain("THEME_COLORS.midnight.paper");
    expect(ogTheme).toContain(
      "OG_PAPER = THEME_COLORS.midnight.paper",
    );
    expect(ogTheme).toContain(
      "OG_EMBER = THEME_COLORS.midnight.ember",
    );
    expect(ogTheme).toContain(
      "OG_GOLD = THEME_COLORS.midnight.gold",
    );
    expect(listingOg).toContain(
      'import { OG_EMBER, OG_INK, OG_PAPER, OG_PINE } from "@/lib/og-theme"',
    );
    expect(listingOg).not.toContain("#f5f0e7");
    expect(listingOg).not.toContain("#c13e19");
    expect(icon).toContain('fill="#10061f"');
    expect(icon).toContain('stroke="#cb6bff"');
    expect(icon).toContain('stroke="#ffd05c"');
  });

  it("leads with the approved casino hero and follows with a current listing", () => {
    const page = source("app/page.tsx");
    const publicHero = page.slice(page.indexOf("// ---- Signed-out"));
    const imageIndex = publicHero.indexOf(
      'src="/brand/sweepza-casino-hero.webp"',
    );
    const titleIndex = publicHero.indexOf('<h1 className="mt-4');
    const listingIndex = publicHero.indexOf(
      'aria-labelledby="daily-drop-heading"',
    );

    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(listingIndex);
    expect(publicHero.match(/<h1/g)).toHaveLength(1);
    expect(publicHero).toContain(
      'className="aspect-[4/3] w-full object-cover object-center sm:aspect-[16/9] lg:aspect-[1200/509]"',
    );
    expect(publicHero).toContain("width={2400}");
    expect(publicHero).toContain("height={1018}");
    expect(publicHero).toContain("One current listing at a glance");
    expect(publicHero).toContain("New listings appear after review");
    expect(publicHero).toContain("{active.length} shown today");
    expect(publicHero).toContain("Browse sweeps");
    expect(publicHero).not.toContain("One verified listing at a glance");
    expect(publicHero).not.toContain("live now");
    expect(publicHero).toContain('<h3 className="mt-3');
    expect(publicHero).toContain("Daily drop");
  });

  it("emits the gamification strip's subtle surfaces and readable microcopy", () => {
    const gamification = source("components/gamification-strip.tsx");

    expect(gamification).toContain("border-paper/[0.12]");
    expect(gamification).toContain("bg-paper/[0.08]");
    expect(gamification).toContain("bg-paper/[0.12]");
    expect(gamification).toContain("text-paper/60");
    expect(gamification).not.toContain("border-paper/12");
    expect(gamification).not.toContain("bg-paper/8");
    expect(gamification).not.toContain("bg-paper/12");
    expect(gamification).not.toContain("text-paper/55");
  });
});
