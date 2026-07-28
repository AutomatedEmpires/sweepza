import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("removes the rejected casino artwork from runtime brand surfaces", () => {
    const runtimeSources = [
      source("app/page.tsx"),
      source("app/layout.tsx"),
      source("lib/structured-data.ts"),
      source("app/opengraph-image.tsx"),
    ].join("\n");

    expect(runtimeSources).not.toContain("sweepza-logo.png");
    expect(source("lib/structured-data.ts")).toContain(
      "/brand/sweepza-mark.svg",
    );
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
