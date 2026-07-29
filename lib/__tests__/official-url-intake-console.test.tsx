import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  deriveOfficialUrlIdempotencyKey,
  formatOfficialUrlIntakeSuccess,
  formatOfficialUrlRevalidationSuccess,
  normalizeOfficialUrl,
  OfficialUrlIntakeConsole,
  OfficialUrlIntakeFeedbackMessage,
  parseOfficialUrlLines,
  prepareOfficialUrlIntake,
} from "@/components/official-url-intake-console";
import { normalizeOfficialUrl as normalizeSharedOfficialUrl } from "@/lib/official-url-normalization";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("OfficialUrlIntakeConsole", () => {
  it("normalizes URLs before deriving stable SHA-256 idempotency keys", async () => {
    expect(normalizeOfficialUrl).toBe(normalizeSharedOfficialUrl);
    const normalized = normalizeOfficialUrl(
      "  https://PROMOTIONS.Example.com/prizes/../rules?cycle=2026#terms  ",
    );
    const expectedDigest = createHash("sha256")
      .update(normalized)
      .digest("hex");

    expect(normalized).toBe(
      "https://promotions.example.com/rules?cycle=2026",
    );
    await expect(deriveOfficialUrlIdempotencyKey(normalized)).resolves.toBe(
      `official-url:sha256:${expectedDigest}`,
    );
    await expect(deriveOfficialUrlIdempotencyKey(normalized)).resolves.toBe(
      `official-url:sha256:${expectedDigest}`,
    );
  });

  it("rejects invalid and duplicate normalized lines before preparing a request", async () => {
    const value = [
      "https://example.com/rules#top",
      "https://EXAMPLE.com/rules",
      "http://sponsor.com/rules",
      "https://user:password@sponsor.com/rules",
      "https://localhost/rules",
    ].join("\n");

    const parsed = parseOfficialUrlLines(value);
    expect(parsed).toEqual({
      ok: false,
      errors: [
        {
          line: 2,
          message: "Duplicates line 1 after URL normalization.",
        },
        { line: 3, message: "URL must use HTTPS." },
        { line: 4, message: "URL must not contain credentials." },
        {
          line: 5,
          message: "URL must use a registrable public hostname.",
        },
      ],
    });
    await expect(prepareOfficialUrlIntake(value)).resolves.toEqual(parsed);
  });

  it("enforces the 1-500 URL batch boundary client-side", () => {
    expect(parseOfficialUrlLines("\n \n")).toEqual({
      ok: false,
      errors: [{ message: "Paste at least one official HTTPS URL." }],
    });

    const oversized = Array.from(
      { length: 501 },
      (_, index) => `https://example.com/rules/${index + 1}`,
    ).join("\n");
    const parsed = parseOfficialUrlLines(oversized);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0]?.message).toBe(
        "A batch may contain at most 500 URLs; this batch contains 501.",
      );
    }
  });

  it("prepares normalized, unique entries in original line order", async () => {
    await expect(
      prepareOfficialUrlIntake(
        [
          "https://example.com/rules#details",
          "",
          "https://sponsor.com/giveaway",
        ].join("\n"),
      ),
    ).resolves.toEqual({
      ok: true,
      entries: [
        {
          officialUrl: "https://example.com/rules",
          idempotencyKey: expect.stringMatching(
            /^official-url:sha256:[a-f0-9]{64}$/,
          ),
        },
        {
          officialUrl: "https://sponsor.com/giveaway",
          idempotencyKey: expect.stringMatching(
            /^official-url:sha256:[a-f0-9]{64}$/,
          ),
        },
      ],
    });
  });

  it("describes exact replays without claiming zero URLs were queued", () => {
    expect(formatOfficialUrlIntakeSuccess(0, 1)).toBe(
      "1 exact replay was already queued and left unchanged. Nothing was published.",
    );
    expect(formatOfficialUrlIntakeSuccess(2, 1)).toBe(
      "2 official URLs were queued for private draft review. 1 exact replay was already queued and left unchanged. Nothing was published.",
    );
    expect(formatOfficialUrlIntakeSuccess(0, 1)).not.toContain(
      "0 official URLs were queued",
    );
  });

  it("describes fresh generations without implying prior work was reopened", () => {
    expect(formatOfficialUrlRevalidationSuccess(1, 0)).toBe(
      "1 fresh validation generation was queued. Existing results were preserved and nothing was published.",
    );
    expect(formatOfficialUrlRevalidationSuccess(0, 2)).toBe(
      "2 requests already have unfinished validation work and were left unchanged. Existing results were preserved and nothing was published.",
    );
  });

  it("renders explicit private-review boundaries and accessible submission states", () => {
    const html = renderToStaticMarkup(<OfficialUrlIntakeConsole />);
    expect(html).toContain("Bulk official URLs");
    expect(html).toContain("Private draft / review only");
    expect(html).toContain("This intake does not publish a promotion");
    expect(html).toContain("name=\"officialUrls\"");
    expect(html).toContain("name=\"officialUrlIntakeOperation\"");
    expect(html).toContain("New intake");
    expect(html).toContain("Revalidate completed");
    expect(html).toContain("without reopening prior work");
    expect(html).toContain("Queue private drafts");

    const pending = renderToStaticMarkup(
      <OfficialUrlIntakeFeedbackMessage feedback={{ kind: "pending" }} />,
    );
    const success = renderToStaticMarkup(
      <OfficialUrlIntakeFeedbackMessage
        feedback={{ kind: "success", message: "Queued safely." }}
      />,
    );
    const failure = renderToStaticMarkup(
      <OfficialUrlIntakeFeedbackMessage
        feedback={{
          kind: "error",
          message: "Fix the batch.",
          details: ["Line 2: duplicate."],
        }}
      />,
    );

    expect(pending).toContain("role=\"status\"");
    expect(success).toContain("role=\"status\"");
    expect(failure).toContain("role=\"alert\"");
    expect(failure).toContain("Line 2: duplicate.");
  });

  it("checks page authorization before service-role-backed source reads", () => {
    const page = readFileSync(
      join(process.cwd(), "app/admin/sources/page.tsx"),
      "utf8",
    );
    const authorization = page.indexOf(
      "const authUser = await ensureCurrentAppUser();",
    );
    const sourceRead = page.indexOf("const health = await getSourceHealth();");

    expect(authorization).toBeGreaterThan(-1);
    expect(sourceRead).toBeGreaterThan(authorization);
    expect(page).toContain(
      "!authUser.appUser.is_admin && !authUser.appUser.is_owner",
    );
    expect(page).toContain("<OfficialUrlIntakeConsole />");
  });
});
