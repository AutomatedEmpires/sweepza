import type { DryRunLeadInput } from "@/lib/ingestion/dry-run";
import type { ReminderCandidate } from "@/lib/seeker-reminders";
import type { PreviewInput } from "@/lib/reminder-preview";

// Built-in samples so the admin operations console can demonstrate the dry-run
// and reminder-preview logic against realistic inputs WITHOUT any database,
// network, or LLM call. These are synthetic sweepstakes — not real listings —
// chosen to exercise each disposition: a clean create, a held listing, a
// cross-source duplicate, and a rejected extraction.

/** A far-future end date so the samples never "expire" as time passes in CI. */
const FUTURE_END = "2099-12-31";

export const SAMPLE_DRY_RUN_LEADS: DryRunLeadInput[] = [
  {
    // Complete + affirmative — would create.
    officialUrl: "https://northwind-appliances.example.com/cash-blast/official-rules",
    extraction: {
      title: "Daily Cash Blast Giveaway",
      shortDescription: "Enter daily for a shot at a $500 cash prize.",
      prizeName: "$500 Cash",
      prizeValue: "$500",
      prizeCategory: "cash",
      entryUrl: "https://northwind-appliances.example.com/cash-blast/enter",
      officialRulesUrl: "https://northwind-appliances.example.com/cash-blast/official-rules",
      endDate: FUTURE_END,
      entryFrequency: "daily",
      eligibilityCountry: "US",
      ageRequirement: 18,
      noPurchaseNecessary: true,
      sponsorName: "Northwind Appliances",
    },
  },
  {
    // No affirmative no-purchase — held for review (hard gate).
    officialUrl: "https://mysteryco.example.com/grand-prize/rules",
    extraction: {
      title: "Mystery Grand Prize Drawing",
      shortDescription: "Win a mystery grand prize worth thousands.",
      prizeName: "Mystery Grand Prize",
      entryUrl: "https://mysteryco.example.com/grand-prize/enter",
      officialRulesUrl: "https://mysteryco.example.com/grand-prize/rules",
      endDate: FUTURE_END,
      entryFrequency: "one time",
      eligibilityCountry: "US",
      noPurchaseNecessary: null,
      sponsorName: "Mystery Co",
    },
  },
  {
    // Same sweep as the first, surfaced under a different discovery link —
    // would be held as a suspected duplicate.
    officialUrl: "https://northwind-appliances.example.com/cash-blast/official-rules?ref=blogb",
    extraction: {
      title: "Cash Blast — Enter Now",
      shortDescription: "The Northwind daily cash giveaway.",
      prizeName: "$500 Cash",
      prizeValue: "$500",
      prizeCategory: "cash",
      entryUrl: "https://northwind-appliances.example.com/cash-blast/enter",
      officialRulesUrl: "https://northwind-appliances.example.com/cash-blast/official-rules",
      endDate: FUTURE_END,
      entryFrequency: "daily",
      eligibilityCountry: "US",
      ageRequirement: 18,
      noPurchaseNecessary: true,
      sponsorName: "Northwind Appliances",
    },
  },
  {
    // Missing prize + description — rejected before insert.
    officialUrl: "https://brokenpage.example.com/unknown",
    extraction: {
      title: "Untitled",
      shortDescription: null,
      prizeName: null,
      entryUrl: null,
      officialRulesUrl: null,
      endDate: null,
      noPurchaseNecessary: null,
    },
  },
];

const now = "2026-07-16T12:00:00.000Z";
const in2Days = "2026-07-18";
const today = "2026-07-16";
const past = "2026-07-10";

export const SAMPLE_REMINDER_INPUTS: PreviewInput[] = [
  {
    userLabel: "Seeker A (active)",
    candidates: [
      {
        // Entered a daily sweep yesterday → ready again.
        listing: { id: "l1", slug: "daily-cash", title: "Daily Cash Blast", endDate: "2099-12-31", entryFrequency: "daily" },
        activity: { enteredAt: "2026-07-15T09:00:00.000Z", savedAt: "2026-07-14T09:00:00.000Z" },
      } satisfies ReminderCandidate,
      {
        // Saved, ends today → ends_today.
        listing: { id: "l2", slug: "ends-today", title: "Weekend Getaway", endDate: today, entryFrequency: "one_time" },
        activity: { savedAt: "2026-07-12T09:00:00.000Z" },
      },
      {
        // Saved, ends in 2 days → ending_soon.
        listing: { id: "l3", slug: "ending-soon", title: "Gift Card Grab", endDate: in2Days, entryFrequency: "one_time" },
        activity: { savedAt: "2026-07-13T09:00:00.000Z" },
      },
    ],
  },
  {
    userLabel: "Seeker B (suppressed)",
    candidates: [
      {
        // Already won → never nudged.
        listing: { id: "l4", slug: "won-it", title: "Big TV Sweeps", endDate: "2099-12-31", entryFrequency: "one_time" },
        activity: { wonAt: "2026-07-01T09:00:00.000Z", enteredAt: "2026-06-01T09:00:00.000Z" },
      },
      {
        // Expired → no reminder.
        listing: { id: "l5", slug: "old-one", title: "Expired Draw", endDate: past, entryFrequency: "one_time" },
        activity: { savedAt: "2026-07-01T09:00:00.000Z" },
      },
      {
        // Not tracked (only viewed) → ending reminders need tracking.
        listing: { id: "l6", slug: "not-tracked", title: "Cooler Kit", endDate: in2Days, entryFrequency: "one_time" },
        activity: {},
      },
    ],
  },
];

export const SAMPLE_REMINDER_NOW = new Date(now);
