import { describe, expect, it } from "vitest";
import {
  assessChange,
  assessExpiration,
  dateOnlyVisibilityFloor,
  dispositionForFailure,
  endOfDayInstant,
  planReverification,
  type MaterialFacts,
  type ReverificationSignals,
} from "@/lib/ingestion/lifecycle";

const NOW = new Date("2026-07-16T12:00:00Z");

describe("assessExpiration — timezone-honest", () => {
  it("keeps yesterday as the inclusive SQL date floor until the UTC-12 grace lapses", () => {
    expect(dateOnlyVisibilityFloor(new Date("2026-07-17T11:59:59.999Z"))).toBe("2026-07-16");
    expect(dateOnlyVisibilityFloor(new Date("2026-07-17T12:00:00.000Z"))).toBe("2026-07-17");
  });

  it("keeps a sweep open through its stated last day, allowing for US timezones", () => {
    // Ends 2026-07-16; at noon UTC it is emphatically still open, and even a
    // west-coast 11:59pm has not passed. Must not read as expired.
    const result = assessExpiration("2026-07-16", NOW, 3, "UTC");
    expect(result.state).toBe("ends_today");
  });

  it("does not expire a sweep at UTC midnight when the west coast is still on the prior day", () => {
    // 2026-07-17T02:00Z is 2026-07-16 7pm Pacific — a sweep ending 07-16 is open.
    const justPastUtcMidnight = new Date("2026-07-17T02:00:00Z");
    expect(
      assessExpiration("2026-07-16", justPastUtcMidnight, 3, "America/Los_Angeles").state,
    ).toBe("ends_today");
  });

  it("uses the entrant timezone for labels instead of UTC", () => {
    // 06:00Z on 07-16 is still 11pm on 07-15 in Los Angeles.
    const latePacificPriorDay = new Date("2026-07-16T06:00:00Z");
    expect(
      assessExpiration("2026-07-16", latePacificPriorDay, 3, "America/Los_Angeles").state,
    ).toBe("ending_soon");
  });

  it("does not claim 'ends today' without an explicit calendar timezone", () => {
    expect(assessExpiration("2026-07-16", NOW).state).toBe("ending_soon");
    expect(assessExpiration("2026-07-16", NOW, 3, "Not/A_Timezone").state).toBe(
      "ending_soon",
    );
  });

  it("expires a sweep once the generous end instant has truly passed", () => {
    const wellAfter = new Date("2026-07-18T12:00:00Z");
    const result = assessExpiration("2026-07-16", wellAfter);
    expect(result.state).toBe("expired");
    expect(result.daysRemaining).toBeLessThan(0);
  });

  it("flags ending soon within the window", () => {
    expect(assessExpiration("2026-07-18", NOW).state).toBe("ending_soon");
    expect(assessExpiration("2026-08-30", NOW).state).toBe("open");
  });

  it("reports unknown for a missing or unparseable end date, never 'expired'", () => {
    expect(assessExpiration(null, NOW).state).toBe("unknown");
    expect(assessExpiration("not-a-date", NOW).state).toBe("unknown");
    expect(assessExpiration("", NOW).state).toBe("unknown");
    expect(assessExpiration("2026-02-29", NOW).state).toBe("unknown");
    expect(assessExpiration("2026-02-30", NOW).state).toBe("unknown");
    expect(assessExpiration("2026-04-31", NOW).state).toBe("unknown");
  });

  it("keeps a date-only sweep open through the UTC-12 civil boundary", () => {
    const stillOpen = new Date("2026-07-17T11:59:59Z");
    const finallyPast = new Date("2026-07-17T12:00:00Z");
    expect(assessExpiration("2026-07-16", stillOpen).state).not.toBe("expired");
    expect(assessExpiration("2026-07-16", finallyPast).state).toBe("expired");
  });

  it("endOfDayInstant is generous by the US-west grace window", () => {
    const base = new Date("2026-07-16T23:59:59Z").getTime();
    expect(endOfDayInstant("2026-07-16")).toBeGreaterThan(base);
  });
});

describe("planReverification — risk-based, never one interval", () => {
  function signals(overrides: Partial<ReverificationSignals> = {}): ReverificationSignals {
    return {
      sourceTier: "official",
      confidence: 0.9,
      lastVerifiedAt: NOW,
      endDate: "2026-12-31",
      consecutiveFailures: 0,
      hasOpenReport: false,
      deadLinkSuspected: false,
      ...overrides,
    };
  }

  it("checks a healthy official listing far less often than a shaky aggregator one", () => {
    const official = planReverification(signals(), NOW);
    const aggregator = planReverification(
      signals({ sourceTier: "discovery", confidence: 0.4 }),
      NOW,
    );
    expect(aggregator.nextDueAt.getTime()).toBeLessThan(official.nextDueAt.getTime());
  });

  it("pulls an ending-soon listing forward", () => {
    const soon = planReverification(signals({ endDate: "2026-07-17" }), NOW);
    const later = planReverification(signals({ endDate: "2026-12-31" }), NOW);
    expect(soon.nextDueAt.getTime()).toBeLessThan(later.nextDueAt.getTime());
  });

  it("escalates hardest on an open user report", () => {
    const reported = planReverification(signals({ hasOpenReport: true }), NOW);
    expect(reported.priority).toBeGreaterThan(planReverification(signals(), NOW).priority);
    // Within ~2h.
    expect(reported.nextDueAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });

  it("shortens the interval as consecutive failures mount", () => {
    const one = planReverification(signals({ consecutiveFailures: 1 }), NOW);
    const three = planReverification(signals({ consecutiveFailures: 3 }), NOW);
    expect(three.nextDueAt.getTime()).toBeLessThanOrEqual(one.nextDueAt.getTime());
  });

  it("always explains its reasoning", () => {
    expect(planReverification(signals(), NOW).reasons.length).toBeGreaterThan(0);
  });

  it("treats a non-finite confidence as low confidence", () => {
    const plan = planReverification(signals({ confidence: Number.NaN }), NOW);
    expect(plan.nextDueAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(plan.reasons).toContain("low extraction confidence → within 24h");
  });
});

describe("assessChange — never silently overwrite a verified listing", () => {
  function facts(overrides: Partial<MaterialFacts> = {}): MaterialFacts {
    return {
      entryUrl: "https://sponsor.example.com/enter",
      officialRulesUrl: "https://sponsor.example.com/rules",
      endDate: "2026-08-01",
      sponsorName: "Northwind",
      prizeName: "Cash",
      entryFrequency: "daily",
      eligibilityCountry: "US",
      eligibilityStates: "CA,NY",
      ageRequirement: "18",
      noPurchaseNecessary: "true",
      entryLimitNotes: "One entry per day",
      ...overrides,
    };
  }

  it("reports unchanged when nothing moved", () => {
    const result = assessChange(facts(), facts(), {
      listingVerified: true,
      previousConfidence: 0.9,
      newConfidence: 0.9,
    });
    expect(result.disposition).toBe("unchanged");
    expect(result.overwriteAllowed).toBe(false);
  });

  it("flags a material change when the entry URL moves", () => {
    const result = assessChange(
      facts(),
      facts({ entryUrl: "https://sponsor.example.com/new-enter" }),
      { listingVerified: false, previousConfidence: 0.8, newConfidence: 0.8 },
    );
    expect(result.disposition).toBe("changed_material");
    expect(result.changes.some((c) => c.field === "entryUrl" && c.material)).toBe(true);
  });

  it("treats a prize-wording tweak as minor", () => {
    const result = assessChange(facts(), facts({ prizeName: "Cash Prize" }), {
      listingVerified: false,
      previousConfidence: 0.8,
      newConfidence: 0.8,
    });
    expect(result.disposition).toBe("changed_minor");
  });

  it("withholds overwrite on a verified listing when new confidence is lower", () => {
    const result = assessChange(facts(), facts({ endDate: "2026-09-01" }), {
      listingVerified: true,
      previousConfidence: 0.9,
      newConfidence: 0.5,
    });
    expect(result.disposition).toBe("changed_material");
    expect(result.overwriteAllowed).toBe(false);
  });

  it("permits overwrite on a verified listing when new confidence is at least equal", () => {
    const result = assessChange(facts(), facts({ endDate: "2026-09-01" }), {
      listingVerified: true,
      previousConfidence: 0.7,
      newConfidence: 0.9,
    });
    expect(result.overwriteAllowed).toBe(true);
  });

  it("routes a disappeared page to dead-link review, never overwrite", () => {
    const result = assessChange(facts(), null, {
      listingVerified: true,
      previousConfidence: 0.9,
      newConfidence: 0,
      pageDisappeared: true,
    });
    expect(result.disposition).toBe("disappeared");
    expect(result.overwriteAllowed).toBe(false);
  });

  it("preserves lifecycle state when no comparable extraction was produced", () => {
    const result = assessChange(facts(), null, {
      listingVerified: true,
      previousConfidence: 0.9,
      newConfidence: 0,
    });
    expect(result.disposition).toBe("unchanged");
    expect(result.overwriteAllowed).toBe(false);
    expect(result.reasons).toContain("no comparable extraction — lifecycle state preserved");
  });

  it("detects an on-page closure", () => {
    const result = assessChange(facts(), facts(), {
      listingVerified: false,
      previousConfidence: 0.8,
      newConfidence: 0.8,
      pageClosed: true,
    });
    expect(result.disposition).toBe("closed");
  });

  it("honors an explicit closure even when no comparable extraction exists", () => {
    const result = assessChange(facts(), null, {
      listingVerified: true,
      previousConfidence: 0.8,
      newConfidence: 0,
      pageClosed: true,
    });
    expect(result.disposition).toBe("closed");
  });

  it.each([
    ["eligibilityStates", "CA,NY", "TX"],
    ["ageRequirement", "18", "21"],
    ["noPurchaseNecessary", "true", "false"],
    ["entryLimitNotes", "One entry per day", "One entry total"],
  ] as const)("treats a %s change as material", (field, before, after) => {
    const result = assessChange(
      facts({ [field]: before }),
      facts({ [field]: after }),
      { listingVerified: true, previousConfidence: 0.9, newConfidence: 0.9 },
    );
    expect(result.disposition).toBe("changed_material");
    expect(result.changes).toContainEqual(expect.objectContaining({ field, material: true }));
  });
});

describe("dispositionForFailure — a blip is not a burial", () => {
  it("retries a first transient failure without suppressing the listing", () => {
    const d = dispositionForFailure("timeout", 0);
    expect(d.action).toBe("retry");
    expect(d.suppressPublicly).toBe(false);
  });

  it("escalates a persistent transient failure to review, still not marked dead", () => {
    const d = dispositionForFailure("server_error", 3);
    expect(d.action).toBe("review");
    expect(d.suppressPublicly).toBe(false);
  });

  it("confirms a 404 once before marking a link dead", () => {
    expect(dispositionForFailure("not_found", 1).action).toBe("retry");
    const dead = dispositionForFailure("not_found", 2);
    expect(dead.action).toBe("mark_dead");
    expect(dead.suppressPublicly).toBe(true);
  });

  it("backs off a bot challenge rather than burying a real listing", () => {
    const d = dispositionForFailure("bot_challenge", 5);
    expect(d.action).toBe("backoff");
    expect(d.suppressPublicly).toBe(false);
  });

  it("never treats our own policy stops as a listing signal", () => {
    expect(dispositionForFailure("blocked_by_policy", 9).action).toBe("no_signal");
    expect(dispositionForFailure("budget_exhausted", 9).action).toBe("no_signal");
  });

  it("sends access-denied and redirect loops to review", () => {
    expect(dispositionForFailure("access_denied", 0).action).toBe("review");
    expect(dispositionForFailure("too_many_redirects", 0).action).toBe("review");
  });
});
