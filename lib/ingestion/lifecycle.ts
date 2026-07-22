import type { FetchFailureClass } from "@/lib/ingestion/http";

// Listing lifecycle integrity — the pure rules for what happens to a sweepstakes
// AFTER it is ingested. Everything here is network-free and deterministic so the
// hard questions ("is this still open in the entrant's timezone?", "when should
// we re-check it?", "did the page change in a way that matters?", "is this link
// dead or just flaky?") are answered by tested logic, not by whatever the cron
// happened to do at 5am.
//
// A sweepstakes is not permanently valid because it was ingested once, and it is
// not dead because one fetch failed. These functions encode both truths.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A date without a stated timezone cannot yield an exact closing instant. Use
// the latest civil timezone boundary (UTC-12) as a conservative visibility
// deadline. This may retain a listing slightly longer, but it cannot bury a
// Hawaii/Alaska/global sweep before its stated calendar day has ended.
const DATE_ONLY_GRACE_HOURS = 12;

/**
 * Earliest inclusive end date that may still be public at `now`.
 *
 * Database reads and the expiry cron operate on SQL `date` values rather than
 * exact closing instants. Shifting the clock back by the canonical UTC-12
 * grace converts that instant rule into the matching inclusive date floor:
 * before 12:00 UTC yesterday's date remains eligible; at 12:00 UTC it does
 * not. Keep every date-only serving boundary on this helper so the query,
 * cache, and lifecycle worker cannot disagree.
 */
export function dateOnlyVisibilityFloor(now: Date = new Date()): string {
  return new Date(now.getTime() - DATE_ONLY_GRACE_HOURS * HOUR_MS)
    .toISOString()
    .slice(0, 10);
}

/** Strict UTC midnight for a real YYYY-MM-DD calendar date, or NaN. */
function dateMidnightUtc(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = Date.UTC(year, month - 1, day);
  const parsed = new Date(instant);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return NaN;
  return instant;
}

/** Whether a value is exactly a real YYYY-MM-DD calendar date. */
export function isValidDateOnly(value: string): boolean {
  return !Number.isNaN(dateMidnightUtc(value));
}

/** The instant a date-only end value actually lapses, being generous by tz. */
export function endOfDayInstant(endDate: string, graceHours = DATE_ONLY_GRACE_HOURS): number {
  const midnight = dateMidnightUtc(endDate);
  if (Number.isNaN(midnight)) return NaN;
  return midnight + DAY_MS - 1 + graceHours * HOUR_MS;
}

export type ExpirationState = "open" | "ending_soon" | "ends_today" | "expired" | "unknown";

export interface ExpirationAssessment {
  state: ExpirationState;
  /** Whole days until the generous end instant; negative once past. null if unknown. */
  daysRemaining: number | null;
}

/** Calendar date for an instant in an explicit IANA timezone, or null. */
function dateInTimeZone(now: Date, timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

/**
 * Assess a listing's expiration honestly. Two clocks, deliberately: the
 * timezone-generous end INSTANT decides open-vs-expired (so we never bury a
 * sweep hours before it truly closes on the west coast), while the CALENDAR
 * end date decides the "ends today / ending soon" label (so a sweep's last day
 * reads as "Ends today", not "Ends soon"). Reports "unknown" for a missing or
 * unparseable date rather than treating it as expired — a listing with no stated
 * end is a data-quality problem for review, not a corpse to auto-hide.
 */
export function assessExpiration(
  endDate: string | null | undefined,
  now: Date = new Date(),
  endingSoonDays = 3,
  calendarTimeZone?: string | null,
): ExpirationAssessment {
  if (!endDate) return { state: "unknown", daysRemaining: null };
  const endInstant = endOfDayInstant(endDate);
  const endMidnight = dateMidnightUtc(endDate);
  if (Number.isNaN(endInstant) || Number.isNaN(endMidnight)) {
    return { state: "unknown", daysRemaining: null };
  }

  // Expired only once the generous instant has passed — the grace window keeps
  // a date-only sweep open through the last plausible civil timezone.
  if (endInstant < now.getTime()) {
    const elapsedDays = Math.floor((endInstant - now.getTime()) / DAY_MS);
    return { state: "expired", daysRemaining: elapsedDays };
  }

  const localDate = dateInTimeZone(now, calendarTimeZone);
  if (!localDate) {
    // Without an entrant/stated timezone, never claim "ends today". We can
    // still safely express proximity to the conservative final instant.
    const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const daysRemaining = Math.max(0, Math.round((endMidnight - utcToday) / DAY_MS));
    return {
      state: daysRemaining <= endingSoonDays ? "ending_soon" : "open",
      daysRemaining,
    };
  }

  const todayMidnight = dateMidnightUtc(localDate);
  const daysRemaining = Math.round((endMidnight - todayMidnight) / DAY_MS);

  if (daysRemaining === 0) return { state: "ends_today", daysRemaining };
  if (daysRemaining < 0) return { state: "ending_soon", daysRemaining: 0 };
  if (daysRemaining <= endingSoonDays) return { state: "ending_soon", daysRemaining };
  return { state: "open", daysRemaining };
}

// ---------------------------------------------------------------------------
// Re-verification scheduling — risk-based, never one global interval.
// ---------------------------------------------------------------------------

export interface ReverificationSignals {
  /** 'official' is authoritative; 'discovery' (aggregator) is riskier. */
  sourceTier: "official" | "discovery";
  /** 0..1 extraction confidence; low confidence ⇒ verify sooner. */
  confidence: number;
  /** When the listing was last successfully verified against the source. */
  lastVerifiedAt: Date | null;
  /** The listing's end date, if known — a sweep about to close is checked more. */
  endDate: string | null;
  /** Consecutive fetch failures so far; a struggling link is checked sooner. */
  consecutiveFailures: number;
  /** A user reported a problem — jump the queue. */
  hasOpenReport: boolean;
  /** Already marked a dead link — verify aggressively to confirm/clear it. */
  deadLinkSuspected: boolean;
  /** Entrant/stated IANA timezone for calendar labels; null keeps labels conservative. */
  calendarTimeZone?: string | null;
}

export interface ReverificationPlan {
  /** When this listing should next be re-verified. */
  nextDueAt: Date;
  /** 0 (routine) .. 100 (check now). Drives the review-queue ordering. */
  priority: number;
  /** Human-readable factors, for the admin surface. */
  reasons: string[];
}

/**
 * Decide when a listing should be re-verified and how urgently. The interval is
 * a base cadence (tighter for aggregator sources and low confidence) pulled
 * EARLIER by risk signals — an ending-soon sweep, repeated failures, a user
 * report, or a suspected dead link all shorten the wait. There is deliberately
 * no single global interval: a high-confidence official listing that ends next
 * year does not deserve the same attention as a shaky aggregator listing that
 * ends tomorrow.
 */
export function planReverification(
  signals: ReverificationSignals,
  now: Date = new Date(),
): ReverificationPlan {
  const reasons: string[] = [];

  // Base cadence in hours.
  let intervalHours = signals.sourceTier === "official" ? 24 * 7 : 24 * 3;
  reasons.push(`${signals.sourceTier} source base cadence ${intervalHours}h`);

  const confidence = Number.isFinite(signals.confidence)
    ? Math.max(0, Math.min(1, signals.confidence))
    : 0;
  if (confidence < 0.5) {
    intervalHours = Math.min(intervalHours, 24);
    reasons.push("low extraction confidence → within 24h");
  } else if (confidence < 0.75) {
    intervalHours = Math.min(intervalHours, 48);
    reasons.push("moderate confidence → within 48h");
  }

  // Ending soon: track it closely so we catch a close or an extension.
  const expiry = assessExpiration(signals.endDate, now, 3, signals.calendarTimeZone);
  if (expiry.state === "ending_soon" || expiry.state === "ends_today") {
    intervalHours = Math.min(intervalHours, 12);
    reasons.push("ending soon → within 12h");
  } else if (expiry.state === "expired") {
    intervalHours = Math.min(intervalHours, 6);
    reasons.push("past end date → confirm closure within 6h");
  }

  // Failing links and reports escalate hardest.
  if (signals.consecutiveFailures > 0) {
    intervalHours = Math.min(intervalHours, Math.max(1, 6 - signals.consecutiveFailures));
    reasons.push(`${signals.consecutiveFailures} consecutive failures → shortened`);
  }
  if (signals.deadLinkSuspected) {
    intervalHours = Math.min(intervalHours, 4);
    reasons.push("dead link suspected → within 4h");
  }
  if (signals.hasOpenReport) {
    intervalHours = Math.min(intervalHours, 2);
    reasons.push("open user report → within 2h");
  }

  const from = signals.lastVerifiedAt ?? now;
  const nextDueAt = new Date(from.getTime() + intervalHours * HOUR_MS);

  // Priority rises the more overdue (or soon-due) the check is.
  const overdueMs = now.getTime() - nextDueAt.getTime();
  const overdueScore = Math.max(0, Math.min(60, Math.round(overdueMs / HOUR_MS)));
  let priority = overdueScore;
  if (signals.hasOpenReport) priority += 30;
  if (signals.deadLinkSuspected) priority += 20;
  if (expiry.state === "ends_today" || expiry.state === "ending_soon") priority += 10;
  priority = Math.max(0, Math.min(100, priority));

  return { nextDueAt, priority, reasons };
}

// ---------------------------------------------------------------------------
// Changed-page detection — never silently overwrite a verified listing.
// ---------------------------------------------------------------------------

/** The subset of extracted facts whose change is materially meaningful. */
export interface MaterialFacts {
  entryUrl: string | null;
  officialRulesUrl: string | null;
  endDate: string | null;
  sponsorName: string | null;
  prizeName: string | null;
  entryFrequency: string | null;
  eligibilityCountry: string | null;
  eligibilityStates: string | null;
  ageRequirement: string | null;
  noPurchaseNecessary: string | null;
  entryLimitNotes: string | null;
}

export type ChangeDisposition =
  | "unchanged"
  | "changed_minor"
  | "changed_material"
  | "closed"
  | "disappeared";

export interface DetectedChange {
  field: keyof MaterialFacts;
  from: string | null;
  to: string | null;
  material: boolean;
}

export interface ChangeAssessment {
  disposition: ChangeDisposition;
  changes: DetectedChange[];
  /**
   * Whether the new extraction may overwrite the stored listing fields. A
   * verified listing is protected: lower-confidence re-extraction can flag a
   * change for review but must NOT silently replace confirmed data.
   */
  overwriteAllowed: boolean;
  reasons: string[];
}

// Which fields are "material" — a change here changes whether/where/how a seeker
// can enter, so it must reach a human. A prize-name wording tweak is minor; a
// changed entry URL or deadline is material.
const MATERIAL_FIELDS: ReadonlySet<keyof MaterialFacts> = new Set<keyof MaterialFacts>([
  "entryUrl",
  "officialRulesUrl",
  "endDate",
  "entryFrequency",
  "eligibilityCountry",
  "eligibilityStates",
  "ageRequirement",
  "noPurchaseNecessary",
  "entryLimitNotes",
]);

function norm(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Compare the previously stored facts against a fresh extraction and decide the
 * disposition. `pageDisappeared`/`pageClosed` come from the fetch layer (a 404
 * or an on-page "this giveaway has ended") and take precedence over field
 * diffing. A verified listing never has its fields overwritten automatically —
 * the change is recorded for review instead.
 */
export function assessChange(
  prev: MaterialFacts,
  next: MaterialFacts | null,
  context: {
    listingVerified: boolean;
    previousConfidence: number;
    newConfidence: number;
    pageDisappeared?: boolean;
    pageClosed?: boolean;
  },
): ChangeAssessment {
  const reasons: string[] = [];

  if (context.pageDisappeared) {
    return {
      disposition: "disappeared",
      changes: [],
      overwriteAllowed: false,
      reasons: ["official page could not be fetched — held for dead-link review"],
    };
  }
  if (context.pageClosed) {
    return {
      disposition: "closed",
      changes: [],
      overwriteAllowed: false,
      reasons: ["official page indicates the sweepstakes has closed"],
    };
  }
  if (!next) {
    return {
      disposition: "unchanged",
      changes: [],
      overwriteAllowed: false,
      reasons: ["no comparable extraction — lifecycle state preserved"],
    };
  }

  const fields: (keyof MaterialFacts)[] = [
    "entryUrl", "officialRulesUrl", "endDate", "sponsorName", "prizeName",
    "entryFrequency", "eligibilityCountry", "eligibilityStates",
    "ageRequirement", "noPurchaseNecessary", "entryLimitNotes",
  ];

  const changes: DetectedChange[] = [];
  for (const field of fields) {
    if (norm(prev[field]) !== norm(next[field])) {
      changes.push({
        field,
        from: prev[field],
        to: next[field],
        material: MATERIAL_FIELDS.has(field),
      });
    }
  }

  if (changes.length === 0) {
    return { disposition: "unchanged", changes, overwriteAllowed: false, reasons: ["no field changes detected"] };
  }

  const hasMaterial = changes.some((c) => c.material);
  const disposition: ChangeDisposition = hasMaterial ? "changed_material" : "changed_minor";
  if (hasMaterial) reasons.push(`material change(s): ${changes.filter((c) => c.material).map((c) => c.field).join(", ")}`);
  else reasons.push(`minor change(s): ${changes.map((c) => c.field).join(", ")}`);

  // Overwrite policy: only when the listing isn't yet verified, OR the new
  // extraction is at least as confident as the old one. A verified listing with
  // a stronger prior reading is never silently downgraded.
  const overwriteAllowed =
    !context.listingVerified || context.newConfidence >= context.previousConfidence;
  reasons.push(
    overwriteAllowed
      ? "overwrite permitted (unverified or equal/greater confidence)"
      : "overwrite withheld (verified listing, lower new confidence) — review only",
  );

  return { disposition, changes, overwriteAllowed, reasons };
}

// ---------------------------------------------------------------------------
// Dead-link disposition — distinguish a blip from a burial.
// ---------------------------------------------------------------------------

export type LinkAction = "ok" | "no_signal" | "retry" | "backoff" | "review" | "mark_dead";

export interface LinkDisposition {
  action: LinkAction;
  /** True when the listing should stop showing publicly pending resolution. */
  suppressPublicly: boolean;
  reason: string;
}

const DEAD_LINK_THRESHOLD = 3;

/**
 * Decide what a fetch failure means for a listing. The central distinction:
 * a transient failure (timeout, network, 5xx) is retried and only escalates to
 * review after it persists, while a definitive signal (404/410) after repeated
 * confirmation marks the link dead. A bot challenge is neither — it means our
 * crawl posture is being rejected, which is an operator problem, not a dead
 * listing, so we back off and flag it rather than burying a real sweepstakes.
 */
export function dispositionForFailure(
  failure: FetchFailureClass | null,
  consecutiveFailures: number,
): LinkDisposition {
  if (failure === null) {
    return { action: "ok", suppressPublicly: false, reason: "fetch succeeded" };
  }

  switch (failure) {
    case "timeout":
    case "network":
    case "rate_limited":
    case "server_error":
      return consecutiveFailures >= DEAD_LINK_THRESHOLD
        ? {
            action: "review",
            suppressPublicly: false,
            reason: `transient failure persisted ${consecutiveFailures}× — needs a human look, not yet marked dead`,
          }
        : { action: "retry", suppressPublicly: false, reason: "transient failure — will retry" };

    case "not_found":
      // The persisted count includes the current failure. Require two observed
      // 404/410 responses before suppression.
      return consecutiveFailures >= 2
        ? {
            action: "mark_dead",
            suppressPublicly: true,
            reason: "official page returned 404/410 twice — promotion removed",
          }
        : {
            action: "retry",
            suppressPublicly: false,
            reason: "first 404 — confirm once more before marking dead (could be a deploy blip)",
          };

    case "access_denied":
      return {
        action: "review",
        suppressPublicly: false,
        reason: "official page now denies access — a human should confirm whether it moved",
      };

    case "bot_challenge":
      return {
        action: "backoff",
        suppressPublicly: false,
        reason: "anti-bot challenge — back off crawl posture; this is not a dead listing",
      };

    case "too_many_redirects":
      return {
        action: "review",
        suppressPublicly: false,
        reason: "redirect loop — the official URL likely changed",
      };

    case "empty_body":
      return { action: "retry", suppressPublicly: false, reason: "empty response — retry" };

    case "blocked_by_policy":
    case "budget_exhausted":
      // Our own limits, not the source's fault — never a listing signal.
      return {
        action: "no_signal",
        suppressPublicly: false,
        reason: "stopped by our own crawl policy — preserve lifecycle state",
      };

    default:
      return { action: "review", suppressPublicly: false, reason: `unclassified failure: ${failure}` };
  }
}
