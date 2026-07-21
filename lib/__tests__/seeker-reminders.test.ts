import { describe, expect, it } from "vitest";
import {
  planReminderForListing,
  planSeekerReminders,
  reminderLogKey,
  type ReminderCandidate,
  type ReminderListing,
} from "@/lib/seeker-reminders";

// Times are built relative to a local NOW (no trailing Z), matching
// sweep-routine.test.ts. nextEntryAt uses local setHours, so anchoring on a
// local instant keeps these assertions timezone-independent.
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-07-14T12:00:00");
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function listing(overrides: Partial<ReminderListing> = {}): ReminderListing {
  return {
    id: "listing-1",
    slug: "dream-cash-10k",
    title: "Dream Cash $10k",
    endDate: new Date(NOW.getTime() + 18 * DAY_MS).toISOString(),
    entryFrequency: "daily",
    ...overrides,
  };
}

function candidate(
  activity: ReminderCandidate["activity"],
  listingOverrides: Partial<ReminderListing> = {},
): ReminderCandidate {
  return { listing: listing(listingOverrides), activity };
}

// A daily entry made yesterday: its window has re-opened by NOW.
const ENTERED_YESTERDAY = new Date(NOW.getTime() - 27 * HOUR_MS).toISOString();
// A daily entry made earlier today: its window has not re-opened yet.
const ENTERED_TODAY = new Date(NOW.getTime() - 3 * HOUR_MS).toISOString();

describe("planReminderForListing", () => {
  it("fires ready_again once a daily entry window has re-opened", () => {
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_YESTERDAY }),
      undefined,
      NOW,
      "UTC",
    );
    expect(result?.type).toBe("ready_again");
    expect(result?.reminderKey).toMatch(DATE_KEY);
  });

  it("does not fire ready_again while the window is still closed", () => {
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_TODAY }),
      undefined,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("never fires ready_again for a one-time sweep", () => {
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_YESTERDAY }, { entryFrequency: "one_time" }),
      undefined,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("fires ends_today for a tracked sweep ending today", () => {
    const result = planReminderForListing(
      candidate(
        { savedAt: new Date(NOW.getTime() - 4 * DAY_MS).toISOString() },
        { endDate: new Date(NOW.getTime()).toISOString() },
      ),
      undefined,
      NOW,
      "UTC",
    );
    expect(result?.type).toBe("ends_today");
    expect(result?.reminderKey).toMatch(DATE_KEY);
  });

  it("fires ending_soon inside the 3-day window", () => {
    const result = planReminderForListing(
      candidate(
        { savedAt: new Date(NOW.getTime() - 4 * DAY_MS).toISOString() },
        { endDate: new Date(NOW.getTime() + 2 * DAY_MS).toISOString() },
      ),
      undefined,
      NOW,
    );
    expect(result?.type).toBe("ending_soon");
  });

  it("does not fire ending reminders for an untracked listing", () => {
    // No saved/entered timestamp ⇒ the user is not tracking it.
    const result = planReminderForListing(
      candidate({}, { endDate: new Date(NOW.getTime() + 1 * DAY_MS).toISOString() }),
      undefined,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("never nudges a won or skipped listing", () => {
    expect(
      planReminderForListing(
        candidate({ enteredAt: ENTERED_YESTERDAY, wonAt: new Date(NOW.getTime() - DAY_MS).toISOString() }),
        undefined,
        NOW,
      ),
    ).toBeNull();
    expect(
      planReminderForListing(
        candidate(
          { savedAt: ENTERED_YESTERDAY, skippedAt: new Date(NOW.getTime() - DAY_MS).toISOString() },
          { endDate: new Date(NOW.getTime() + DAY_MS).toISOString() },
        ),
        undefined,
        NOW,
      ),
    ).toBeNull();
  });

  it("never nudges an expired listing", () => {
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_YESTERDAY }, { endDate: new Date(NOW.getTime() - 2 * DAY_MS).toISOString() }),
      undefined,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("never plans a prior UTC calendar date during the visibility grace window", () => {
    const result = planReminderForListing(
      candidate(
        { savedAt: "2026-07-19T12:00:00.000Z" },
        { endDate: "2026-07-20" },
      ),
      undefined,
      new Date("2026-07-21T01:00:00.000Z"),
      "UTC",
    );
    expect(result).toBeNull();
  });

  it("prefers the more urgent ends_today over ready_again on the same listing", () => {
    // Daily sweep entered yesterday (ready again) that also ends today.
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_YESTERDAY }, { endDate: new Date(NOW.getTime()).toISOString() }),
      undefined,
      NOW,
      "UTC",
    );
    expect(result?.type).toBe("ends_today");
  });

  it("respects per-event opt-outs", () => {
    const result = planReminderForListing(
      candidate({ enteredAt: ENTERED_YESTERDAY }, { endDate: new Date(NOW.getTime() + 18 * DAY_MS).toISOString() }),
      { readyAgain: false, endsToday: true, endsSoon: true },
      NOW,
    );
    expect(result).toBeNull();
  });
});

describe("planSeekerReminders", () => {
  it("orders reminders by urgency then soonest end date", () => {
    const savedAt = new Date(NOW.getTime() - 4 * DAY_MS).toISOString();
    const reminders = planSeekerReminders(
      [
        candidate({ enteredAt: ENTERED_YESTERDAY }, { id: "a", endDate: new Date(NOW.getTime() + 18 * DAY_MS).toISOString() }),
        candidate({ savedAt }, { id: "b", endDate: new Date(NOW.getTime()).toISOString() }),
        candidate({ savedAt }, { id: "c", endDate: new Date(NOW.getTime() + 2 * DAY_MS).toISOString() }),
      ],
      undefined,
      NOW,
      "UTC",
    );
    expect(reminders.map((r) => r.type)).toEqual([
      "ends_today",
      "ending_soon",
      "ready_again",
    ]);
  });

  it("emits at most one reminder per listing", () => {
    const reminders = planSeekerReminders(
      [candidate({ enteredAt: ENTERED_YESTERDAY }, { endDate: new Date(NOW.getTime()).toISOString() })],
      undefined,
      NOW,
    );
    expect(reminders).toHaveLength(1);
  });

  it("keeps current reminders when a mixed page contains a grace-visible prior date", () => {
    const savedAt = "2026-07-19T12:00:00.000Z";
    const reminders = planSeekerReminders(
      [
        candidate({ savedAt }, { id: "stale", endDate: "2026-07-20" }),
        candidate({ savedAt }, { id: "current", endDate: "2026-07-21" }),
      ],
      undefined,
      new Date("2026-07-21T01:00:00.000Z"),
      "UTC",
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      type: "ends_today",
      listing: { id: "current" },
    });
  });
});

describe("reminderLogKey", () => {
  it("is stable per type + listing + window", () => {
    expect(
      reminderLogKey({ type: "ready_again", listing: { id: "l1" }, reminderKey: "2026-07-14" }),
    ).toBe("ready_again|l1|2026-07-14");
  });
});
