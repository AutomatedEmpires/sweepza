import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildThemeColors,
  readTokenHex,
  renderGeneratedModule,
} from "../theme-colors-lib.mjs";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("theme color generation", () => {
  it("ignores comments and matches exact custom-property names", () => {
    const css = `
      /* --sun-paper: 1 2 3; */
      :root {
        --not-sun-paper: 4 5 6;
        --sun-paper: 247 243 255;
      }
    `;

    expect(readTokenHex(css, "--sun-paper")).toBe("#F7F3FF");
  });

  it("fails closed when a required token is missing or duplicated", () => {
    expect(() => readTokenHex(":root {}", "--sun-paper")).toThrow(
      "is missing",
    );
    expect(() =>
      readTokenHex(
        ":root { --sun-paper: 1 2 3; } .other { --sun-paper: 4 5 6; }",
        "--sun-paper",
      ),
    ).toThrow("exactly one declaration");
  });

  it("rejects malformed and out-of-range RGB channels", () => {
    expect(() =>
      readTokenHex(":root { --sun-paper: 1 2; }", "--sun-paper"),
    ).toThrow("exactly three integer RGB channels");
    expect(() =>
      readTokenHex(":root { --sun-paper: 256 2 3; }", "--sun-paper"),
    ).toThrow("invalid RGB channel");
  });

  it("keeps the generated module exactly synchronized with canonical tokens", () => {
    const tokens = source("app/tokens.css");
    const generated = source("lib/generated/theme-colors.ts");

    expect(renderGeneratedModule(buildThemeColors(tokens))).toBe(generated);
  });
});
