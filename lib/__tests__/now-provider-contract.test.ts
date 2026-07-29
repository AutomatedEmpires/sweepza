import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared render clock", () => {
  it("preserves the server instant for hydration, then catches up while mounted", () => {
    const source = readFileSync(join(process.cwd(), "lib/now.tsx"), "utf8");

    expect(source).toContain("useState(value)");
    expect(source).toContain("window.setInterval(update, 60_000)");
    expect(source).toContain('window.addEventListener("focus", update)');
    expect(source).toContain(
      'document.addEventListener("visibilitychange", updateWhenVisible)',
    );
    expect(source).toContain('document.visibilityState === "visible"');
  });
});
