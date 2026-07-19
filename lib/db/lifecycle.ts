import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DuplicateExplanation } from "@/lib/ingestion/fingerprint";
import type {
  ChangeAssessment,
  ReverificationPlan,
} from "@/lib/ingestion/lifecycle";

// Persistence for listing lifecycle bookkeeping. These are the writes a
// re-verification pass WOULD make — recording when a listing is next due, what
// changed at its source, whether its link is failing, and which listings look
// like duplicates. They are pure data-layer wrappers with no live caller in
// this PR; the (still-gated) re-verification job and the admin dry-run surfaces
// call them. Nothing here publishes, hides, or deletes a listing.

/** Store the computed next-due time and priority for a listing. */
export async function saveReverificationSchedule(
  listingId: string,
  plan: ReverificationPlan,
  verifiedAt: Date | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_ingestion")
    .update({
      next_verify_due_at: plan.nextDueAt.toISOString(),
      verify_priority: plan.priority,
      verify_reasons: plan.reasons,
      ...(verifiedAt ? { last_verified_at: verifiedAt.toISOString() } : {}),
    })
    .eq("listing_id", listingId)
    .select("listing_id")
    .maybeSingle<{ listing_id: string }>();
  if (error) throw new Error(`saveReverificationSchedule failed: ${error.message}`);
  if (!data) throw new Error(`saveReverificationSchedule failed: no ingestion row for "${listingId}"`);
}

/** Update dead-link tracking after a fetch attempt. */
export async function saveDeadLinkStatus(
  listingId: string,
  status: {
    deadLinkStatus: "suspected" | "confirmed" | null;
    consecutiveFailures: number;
    lastFailureClass: string | null;
  },
): Promise<void> {
  if (!Number.isInteger(status.consecutiveFailures) || status.consecutiveFailures < 0) {
    throw new Error("saveDeadLinkStatus failed: consecutiveFailures must be a nonnegative integer");
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_ingestion")
    .update({
      dead_link_status: status.deadLinkStatus,
      consecutive_fetch_failures: status.consecutiveFailures,
      last_fetch_failure_class: status.lastFailureClass,
    })
    .eq("listing_id", listingId)
    .select("listing_id")
    .maybeSingle<{ listing_id: string }>();
  if (error) throw new Error(`saveDeadLinkStatus failed: ${error.message}`);
  if (!data) throw new Error(`saveDeadLinkStatus failed: no ingestion row for "${listingId}"`);
}

/**
 * Append the detected changes from an assessment to the audit log. Appends one
 * row per changed field (plus a synthetic row for closed/disappeared), so the
 * reviewer sees each change with its old and new value. Append-only by DB
 * trigger — a correction is a new row, never an edit.
 */
interface ChangeEventRow {
  listing_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  material: boolean;
  disposition: string;
  overwrite_allowed: boolean;
}

export async function recordChangeEvents(
  listingId: string,
  assessment: ChangeAssessment,
): Promise<void> {
  // 'unchanged' is not worth an audit row — only record when something happened.
  if (assessment.disposition === "unchanged") return;

  const rows: ChangeEventRow[] =
    assessment.changes.length > 0
      ? assessment.changes.map((change) => ({
          listing_id: listingId,
          field: change.field,
          old_value: change.from,
          new_value: change.to,
          material: change.material,
          disposition: assessment.disposition,
          overwrite_allowed: assessment.overwriteAllowed,
        }))
      : [
          {
            listing_id: listingId,
            field: assessment.disposition, // 'closed' | 'disappeared'
            old_value: null,
            new_value: null,
            material: true,
            disposition: assessment.disposition,
            overwrite_allowed: false,
          },
        ];

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("listing_change_event").insert(rows);
  if (error) throw new Error(`recordChangeEvents failed: ${error.message}`);
}

/**
 * Record (or refresh) a duplicate candidate pair with its explanation. The pair
 * is stored under a stable ordering so the same two listings never produce two
 * mirror-image rows. `distinct` verdicts are not stored — only pairs a reviewer
 * might act on (identical / suspected).
 */
export async function recordDuplicateCandidate(
  listingId: string,
  otherListingId: string,
  explanation: DuplicateExplanation,
): Promise<void> {
  if (explanation.verdict === "distinct") return;
  if (listingId === otherListingId) {
    throw new Error("recordDuplicateCandidate failed: a listing cannot duplicate itself");
  }
  if (!Number.isFinite(explanation.strength) || explanation.strength < 0 || explanation.strength > 1) {
    throw new Error("recordDuplicateCandidate failed: strength must be between 0 and 1");
  }

  const [a, b] = [listingId, otherListingId].sort();
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("listing_duplicate_candidate").upsert(
    {
      listing_id: a,
      other_listing_id: b,
      verdict: explanation.verdict,
      strength: explanation.strength,
      signals: explanation.signals,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "listing_id,other_listing_id" },
  );
  if (error) throw new Error(`recordDuplicateCandidate failed: ${error.message}`);
}
