import { describe, expect, it } from "vitest";
import {
  previewReminderBatch,
  previewSeekerReminders,
  type PreviewInput,
} from "@/lib/reminder-preview";
import { reminderLogKey, type ReminderCandidate } from "@/lib/seeker-reminders";
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
    const preview = previewSeekerReminders(input, { now: NOW });
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
    const preview = previewSeekerReminders(input, { now: NOW });
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
      { now: NOW },
    );
    expect(preview.digest).toBeNull();
    expect(preview.verdicts[0].suppression).toBe("already_sent");
  });

  it("respects a preference toggle", () => {
    const c = candidate({}, { savedAt: "2026-07-12T00:00:00Z" });
    const preview = previewSeekerReminders(
      { userLabel: "Seeker", candidates: [c], prefs: { readyAgain: true, endsToday: true, endsSoon: false } },
      { now: NOW },
    );
    // endsSoon off ⇒ this ending-soon candidate drops out.
    expect(preview.digest).toBeNull();
  });

  it("builds listing URLs from the base url", () => {
    const preview = previewSeekerReminders(
      { userLabel: "S", candidates: [candidate({ slug: "cool-sweep" }, { savedAt: "2026-07-12T00:00:00Z" })] },
      { now: NOW, baseUrl: "https://sweepza.com/" },
    );
    expect(preview.digest?.items[0].listingUrl).toBe("https://sweepza.com/sweeps/cool-sweep");
  });
});

describe("previewReminderBatch", () => {
  it("aggregates the built-in samples with sane totals", () => {
    const summary = previewReminderBatch(SAMPLE_REMINDER_INPUTS, { now: SAMPLE_REMINDER_NOW });
    expect(summary.totals.users).toBe(2);
    // Seeker A gets reminders; Seeker B is fully suppressed.
    expect(summary.totals.usersEmailed).toBe(1);
    expect(summary.totals.reminders).toBeGreaterThanOrEqual(2);
    expect(summary.totals.suppressed).toBeGreaterThanOrEqual(3);
  });
});
