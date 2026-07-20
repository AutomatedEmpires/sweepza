import { describe, expect, it } from "vitest";
import {
  previewReminderBatch,
  previewSeekerReminders,
  type PreviewInput,
} from "@/lib/reminder-preview";
import {
  planSeekerReminders,
  reminderLogKey,
  type ReminderCandidate,
} from "@/lib/seeker-reminders";
import {
  SAMPLE_REMINDER_INPUTS,
  SAMPLE_REMINDER_NOW,
} from "@/lib/ingestion/dry-run-samples";

const NOW = new Date("2026-07-16T12:00:00.000Z");

function candidate(overrides: Partial<ReminderCandidate["listing"]> = {}, activity = {}): ReminderCandidate {
  return {
    listing: {
      id: "l1",
      slug: "slug",
      title: "A Sweep",
      endDate: "2026-07-18",
      entryFrequency: "one_time",
      ...overrides,
    },
    activity,
  };
}

describe("previewSeekerReminders", () => {
  it("renders a digest for a seeker with due reminders", () => {
    const input: PreviewInput = {
      userLabel: "Seeker",
      candidates: [candidate({}, { savedAt: "2026-07-12T00:00:00Z" })], // ending soon
    };
    const preview = previewSeekerReminders(input, { now: NOW, calendarTimeZone: "UTC" });
    expect(preview.digest).not.toBeNull();
    expect(preview.digest?.itemCount).toBe(1);
    expect(preview.verdicts[0].included).toBe(true);
    expect(preview.verdicts[0].reminderType).toBe("ending_soon");
  });

  it("emits no digest and explains every suppression", () => {
    const input: PreviewInput = {
      userLabel: "Seeker",
      candidates: [
        candidate({ id: "won" }, { wonAt: "2026-07-01T00:00:00Z" }),
        candidate({ id: "expired", endDate: "2026-07-10" }, { savedAt: "2026-07-01T00:00:00Z" }),
        candidate({ id: "untracked" }, {}),
      ],
    };
    const preview = previewSeekerReminders(input, { now: NOW, calendarTimeZone: "UTC" });
    expect(preview.digest).toBeNull();
    const reasons = Object.fromEntries(preview.verdicts.map((v) => [v.listingId, v.suppression]));
    expect(reasons.won).toBe("won");
    expect(reasons.expired).toBe("expired");
    expect(reasons.untracked).toBe("not_tracked");
  });

  it("suppresses a reminder already sent for this window (dedupe)", () => {
    const c = candidate({}, { savedAt: "2026-07-12T00:00:00Z" });
    const key = reminderLogKey({ type: "ending_soon", listing: { id: c.listing.id }, reminderKey: "2026-07-18" });
    const preview = previewSeekerReminders(
      { userLabel: "Seeker", candidates: [c], alreadySent: new Set([key]) },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    expect(preview.digest).toBeNull();
    expect(preview.verdicts[0].suppression).toBe("already_sent");
  });

  it("respects a preference toggle", () => {
    const c = candidate({}, { savedAt: "2026-07-12T00:00:00Z" });
    const preview = previewSeekerReminders(
      { userLabel: "Seeker", candidates: [c], prefs: { readyAgain: true, endsToday: true, endsSoon: false } },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    // endsSoon off ⇒ this ending-soon candidate drops out.
    expect(preview.digest).toBeNull();
    expect(preview.verdicts[0].suppression).toBe("pref_off");
  });

  it("builds listing URLs from the base url", () => {
    const preview = previewSeekerReminders(
      { userLabel: "S", candidates: [candidate({ slug: "cool-sweep" }, { savedAt: "2026-07-12T00:00:00Z" })] },
      { now: NOW, baseUrl: "https://sweepza.com/", calendarTimeZone: "UTC" },
    );
    expect(preview.digest?.items[0].listingUrl).toBe("https://sweepza.com/sweeps/cool-sweep");
    expect(preview.digest?.todayUrl).toBe("https://sweepza.com/");
  });

  it("does not claim ends today without an explicit calendar timezone", () => {
    const endsToday = candidate(
      { endDate: "2026-07-16" },
      { savedAt: "2026-07-12T00:00:00Z" },
    );
    const conservative = previewSeekerReminders(
      { userLabel: "S", candidates: [endsToday] },
      { now: NOW },
    );
    const localized = previewSeekerReminders(
      { userLabel: "S", candidates: [endsToday] },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    expect(conservative.verdicts[0].reminderType).toBe("ending_soon");
    expect(localized.verdicts[0].reminderType).toBe("ends_today");
  });

  it("matches production's timezone-free planner output by default", () => {
    const endsToday = candidate(
      { endDate: "2026-07-16" },
      { savedAt: "2026-07-12T00:00:00Z" },
    );
    const preview = previewSeekerReminders(
      { userLabel: "S", candidates: [endsToday] },
      { now: NOW },
    );
    const productionPlan = planSeekerReminders([endsToday], undefined, NOW);
    expect(preview.digest?.items.map((item) => item.kind)).toEqual(
      productionPlan.map((planned) => planned.type),
    );
  });

  it("mirrors delivery suppression for disabled email and missing addresses", () => {
    const due = candidate({}, { savedAt: "2026-07-12T00:00:00Z" });
    const disabled = previewSeekerReminders(
      { userLabel: "S", candidates: [due], emailEnabled: false },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    const missing = previewSeekerReminders(
      { userLabel: "S", candidates: [due], hasEmailAddress: false },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    expect(disabled.verdicts[0].suppression).toBe("email_disabled");
    expect(missing.verdicts[0].suppression).toBe("missing_email");
    expect(disabled.digest).toBeNull();
    expect(missing.digest).toBeNull();
  });

  it("uses production urgency ordering and the shared 12-item cap", () => {
    const candidates = Array.from({ length: 13 }, (_, index) =>
      candidate(
        { id: `soon-${index}`, slug: `soon-${index}` },
        { savedAt: "2026-07-12T00:00:00Z" },
      ),
    );
    candidates.push(
      candidate(
        { id: "today", slug: "today", endDate: "2026-07-16" },
        { savedAt: "2026-07-12T00:00:00Z" },
      ),
    );
    const preview = previewSeekerReminders(
      { userLabel: "S", candidates },
      { now: NOW, calendarTimeZone: "UTC" },
    );
    expect(preview.digest?.itemCount).toBe(12);
    expect(preview.digest?.items[0].title).toBe("A Sweep");
    expect(preview.digest?.items[0].kind).toBe("ends_today");
    expect(preview.verdicts.filter((v) => v.suppression === "digest_cap")).toHaveLength(2);
  });
});

describe("previewReminderBatch", () => {
  it("aggregates the built-in samples with sane totals", () => {
    const summary = previewReminderBatch(SAMPLE_REMINDER_INPUTS, {
      now: SAMPLE_REMINDER_NOW,
    });
    expect(summary.totals.users).toBe(2);
    // Seeker A gets reminders; Seeker B is fully suppressed.
    expect(summary.totals.usersEmailed).toBe(1);
    expect(summary.totals.reminders).toBeGreaterThanOrEqual(2);
    expect(summary.totals.suppressed).toBeGreaterThanOrEqual(3);
  });
});
