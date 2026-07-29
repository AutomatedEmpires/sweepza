import { describe, expect, it } from "vitest";
import { normalizeThemePreference } from "@/lib/theme";

describe("theme preference normalization", () => {
  it.each([null, undefined, "", "auto", "system", "sepia"])(
    "defaults %s to the Midnight experience",
    (value) => {
      expect(normalizeThemePreference(value)).toBe("dark");
    },
  );

  it("preserves explicit dashboard choices", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("light")).toBe("light");
  });
});
