import { describe, expect, it } from "vitest";
import { officialUrlIntakeBatchSchema } from "@/lib/official-url-intake-schema";
import { normalizeOfficialUrl } from "@/lib/official-url-normalization";

describe("official URL intake schema", () => {
  it("uses the shared canonical URL normalization result", () => {
    const raw =
      "  https://PROMOTIONS.Example.com/prizes/../rules?cycle=2026#terms  ";
    const canonical = normalizeOfficialUrl(raw);

    const parsed = officialUrlIntakeBatchSchema.parse({
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: raw,
        },
      ],
    });

    expect(canonical).toBe(
      "https://promotions.example.com/rules?cycle=2026",
    );
    expect(parsed.entries[0]?.officialUrl).toBe(canonical);
  });

  it("rejects normalized URL duplicates even when request keys differ", () => {
    const parsed = officialUrlIntakeBatchSchema.safeParse({
      operation: "revalidate",
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: "https://sponsor.example.com/rules#details",
        },
        {
          idempotencyKey: "partner-feed:promotion-43",
          officialUrl: "https://SPONSOR.EXAMPLE.COM/rules",
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["entries", 1, "officialUrl"],
          message:
            "Official URL duplicates entry 1 after normalization.",
        }),
      ]),
    );
  });
});
