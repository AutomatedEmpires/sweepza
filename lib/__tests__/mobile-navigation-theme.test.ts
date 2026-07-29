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

  it("keeps browser chrome synchronized with the tokenized jewel canvases", () => {
    const tokens = source("app/tokens.css");
    const layout = source("app/layout.tsx");
    const manifest = source("app/manifest.ts");
    const ogTheme = source("lib/og-theme.tsx");
    const icon = source("app/icon.svg");

    expect(tokens).not.toContain("--sun-ember: 190 64 50");

    expect(THEME_COLORS).toEqual(buildThemeColors(tokens));

    expect(layout).toContain("THEME_COLORS.sunrise.paper");
    expect(layout).toContain("THEME_COLORS.midnight.paper");
    expect(manifest).toContain("THEME_COLORS.sunrise.paper");
    expect(ogTheme).toContain(
      "OG_PAPER = THEME_COLORS.sunrise.paper",
    );
    expect(ogTheme).toContain(
      "OG_EMBER = THEME_COLORS.sunrise.ember",
    );
    expect(ogTheme).toContain(
      "OG_GOLD = THEME_COLORS.sunrise.gold",
    );
    expect(icon).toContain('fill="#10061f"');
    expect(icon).toContain('stroke="#cb6bff"');
    expect(icon).toContain('stroke="#ffd05c"');
  });

  it("puts a current listing first on mobile without overstating review status", () => {
    const page = source("app/page.tsx");

    expect(page).toContain("order-2 max-w-xl lg:order-1");
    expect(page).toContain("relative order-1");
    expect(page).toContain("lg:order-2");
    expect(page.indexOf("relative order-1")).toBeLessThan(
      page.indexOf("order-2 max-w-xl"),
    );
    expect(page).toContain(
      'className="aspect-[2500/1696] w-full object-contain"',
    );
    expect(page).toContain("One current listing at a glance");
    expect(page).toContain("New listings appear after review");
    expect(page).toContain("{active.length} shown today");
    expect(page).toContain("Browse today&apos;s board");
    expect(page).not.toContain("One verified listing at a glance");
    expect(page).not.toContain("live now");
    expect(page).toContain("<h2");
    expect(page).toContain("Daily drop");
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
