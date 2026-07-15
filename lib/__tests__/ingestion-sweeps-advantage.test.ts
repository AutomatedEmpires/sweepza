import { describe, expect, it } from "vitest";
import {
  parseNewestDailyPath,
  parseSweepsAdvantageDaily,
} from "@/lib/ingestion/adapters/sweeps-advantage";

// Fixtures reproduce the real Sweeps Advantage markup structure (container
// data-link_id, panel-heading title link, sweepstake-details labeled fields)
// with synthetic content — enough to exercise the parser without copying the
// site's listings.
const HUB_HTML = `
  <h2>New Sweepstakes</h2>
  <a href="/new-sweepstakes-1784073600.html" class="text-warning">Wednesday, July 15 2026 New Sweepstakes</a>
  <a href="/new-sweepstakes-1783987200.html" class="text-warning">Tuesday, July 14 2026 New Sweepstakes</a>
`;

const DAILY_HTML = `
<div class="panel panel-default sweepstake-item" data-link_id="1539742" style="border:1px solid #ddd;">
  <div class="panel-heading">
    <span class="pop-checkbox">&#9633;</span>
    1.
    <a href="/sweepstakes-1539742.html" target="_blank" rel="nofollow">Daily Cash Blast Giveaway</a>
  </div>
  <div class="panel-body">
    <p class="sweepstake-description">Enter every day for a shot at cold hard cash.</p>
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Restrictions:</strong> 18+ US only.</div>
      <div class="pull-left"><strong>Limit:</strong> Unlimited Daily Entry</div>
      <div class="pull-left"><strong>Added:</strong> 07-14-2026</div>
      <div class="pull-left"><strong>Expires:</strong> 07-31-2026 11:59 PM EST</div>
      <div class="pull-left"><strong>Value:</strong> $50.00</div>
      <div class="pull-left"><strong>Category:</strong> <a href="/new-sweepstakes1-1783987200.html">Daily Entry Sweepstakes</a></div>
    </div>
  </div>
</div>
<div class="panel panel-default sweepstake-item" data-link_id="1551236" style="border:1px solid #ddd;">
  <div class="panel-heading">
    <span class="pop-checkbox">&#9633;</span>
    2.
    <a href="/sweepstakes-1551236.html" target="_blank" rel="nofollow">Books &amp; Brews Giveaway</a>
  </div>
  <div class="panel-body">
    <p class="sweepstake-description">Win a year of books.</p>
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Restrictions:</strong> 21+ US &amp; Canada.</div>
      <div class="pull-left"><strong>Limit:</strong> One Time Entry</div>
      <div class="pull-left"><strong>Added:</strong> 07-14-2026</div>
      <div class="pull-left"><strong>Expires:</strong> 08-15-2026 11:59 PM EST</div>
      <div class="pull-left"><strong>Value:</strong> $1,000.00</div>
    </div>
  </div>
</div>
`;

describe("parseNewestDailyPath", () => {
  it("returns the first (newest) daily listing path", () => {
    expect(parseNewestDailyPath(HUB_HTML)).toBe("/new-sweepstakes-1784073600.html");
  });
  it("returns null when no daily link is present", () => {
    expect(parseNewestDailyPath("<h2>nothing here</h2>")).toBeNull();
  });
});

describe("parseSweepsAdvantageDaily", () => {
  const cards = parseSweepsAdvantageDaily(DAILY_HTML);

  it("extracts one card per listing", () => {
    expect(cards).toHaveLength(2);
  });

  it("derives ids, redirect + detail paths, and decodes the title", () => {
    expect(cards[0]).toMatchObject({
      sourceId: "1539742",
      redirectPath: "/go.php?id=1539742",
      detailPath: "/sweepstakes-1539742.html",
      title: "Daily Cash Blast Giveaway",
    });
    expect(cards[1].title).toBe("Books & Brews Giveaway");
  });

  it("maps the metadata hints (never trusted for publish, only prioritization)", () => {
    expect(cards[0]).toMatchObject({
      hintEndDate: "2026-07-31",
      hintFrequency: "daily",
      hintValue: 50,
    });
    expect(cards[1]).toMatchObject({
      hintEndDate: "2026-08-15",
      hintFrequency: "one_time",
      hintValue: 1000,
    });
  });

  it("ignores markup with no listing containers", () => {
    expect(parseSweepsAdvantageDaily("<div>no listings</div>")).toEqual([]);
  });
});
