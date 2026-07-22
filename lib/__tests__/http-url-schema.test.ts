import { describe, expect, it } from "vitest";

import {
  publicHttpUrlSchema,
  publicHttpsUrlSchema,
} from "@/lib/http-url-schema";

describe("public URL schemas", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:secret@example.com/path",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://[::1]",
    "http://[fd00::1]",
    "http://[fe80::1]",
    "http://[::ffff:127.0.0.1]",
  ])("rejects non-public URL %s", (url) => {
    expect(publicHttpUrlSchema.safeParse(url).success).toBe(false);
  });

  it.each([
    "https://fca.org/promotion",
    "https://fdic.gov/news",
    "http://example.com/rules",
  ])("accepts public HTTP(S) URL %s", (url) => {
    expect(publicHttpUrlSchema.safeParse(url).success).toBe(true);
  });

  it("requires HTTPS without throwing on malformed input", () => {
    expect(publicHttpsUrlSchema.safeParse("not-a-url").success).toBe(false);
    expect(publicHttpsUrlSchema.safeParse("http://example.com").success).toBe(false);
    expect(publicHttpsUrlSchema.safeParse("https://example.com").success).toBe(true);
  });
});
