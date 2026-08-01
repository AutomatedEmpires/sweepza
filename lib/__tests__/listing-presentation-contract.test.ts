import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("listing presentation contract", () => {
  it("keeps the canonical card image-led with dates, rules, and one primary action", () => {
    const card = source("components/listing-card.tsx");
    const action = source("lib/listing-entry-action.ts");

    expect(card).toContain('rounded-[1.75rem]');
    expect(card).toContain('tone === "featured" ? "aspect-[16/10]"');
    expect(card).toContain("<dt");
    expect(card).toContain("Begins");
    expect(card).toContain("Ends");
    expect(card).toContain("line-clamp-4");
    expect(card).toContain("Official Rules");
    expect(card).toContain('aria-label={`More info about ${listing.title}`}');
    expect(card).not.toContain('{ label: "Entry schedule"');
    expect(card).not.toContain('{ label: "Source", value: sourceText }');
    expect(action).toContain('label: "ENTER NOW"');
    expect(action).toContain('label: "ENTER AGAIN"');
    expect(action).toContain('label: "ENTRY RECORDED"');
    expect(card).not.toContain("Open official entry");
  });

  it("renders one clear summary and a semantic uniform information sheet", () => {
    const detail = source("components/listing-detail.tsx");

    expect(detail).toContain("<SectionHeading>About this sweep</SectionHeading>");
    expect(detail).not.toContain("Sweepza normalized summary");
    expect(detail).toContain(
      "<SectionHeading>Sweepstakes information</SectionHeading>",
    );
    expect(detail).toContain("<dl");
    expect(detail).toContain("<dt");
    expect(detail).toContain("<dd");

    for (const label of [
      "Sponsor",
      "Source",
      "Prize",
      "Estimated value",
      "Winners",
      "Purchase requirements",
      "Entry schedule",
    ]) {
      expect(detail).toContain(`label="${label}"`);
    }
  });

  it("uses the plain Official Rules label without repeated authority copy", () => {
    const detail = source("components/listing-detail.tsx");

    expect(detail).toContain("Official Rules");
    expect(detail).not.toContain("Official rules (authoritative)");
    expect(detail).not.toContain("Official Rules (authoritative)");
  });

  it("uses the same lifecycle-aware entry action in swipe mode", () => {
    const swipe = source("components/swipe-deck.tsx");

    expect(swipe).toContain("getListingEntryAction");
    expect(swipe).toContain("currentEntryAction?.canOpen");
    expect(swipe).toContain("disabled={!currentEntryAction?.canOpen}");
    expect(swipe).toContain("currentEntryAction?.label");
    expect(swipe).toContain("currentNextEntryAt - Date.now()");
    expect(swipe).toContain("setEntryNowMs(Date.now())");
    expect(swipe).toContain("inert={isTop ? undefined : true}");
    expect(swipe).toContain("event.target !== event.currentTarget");
    expect(swipe).toContain(
      'event.target.closest("a, button, input, select, textarea, [role=\'button\']")',
    );
  });
});
