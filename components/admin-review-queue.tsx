"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import type { ReviewQueueListing } from "@/lib/db/listing-review";
import type { ReviewAction } from "@/lib/listing-review-schema";

function formatDate(date: string | null): string {
  if (!date) return "No end date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function AdminReviewQueue({
  listings,
}: {
  listings: ReviewQueueListing[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<
    Record<string, { error?: string; message?: string }>
  >({});

  function runAction(listingId: string, action: ReviewAction) {
    setActiveId(listingId);
    startTransition(async () => {
      setFeedback((prev) => ({ ...prev, [listingId]: {} }));
      try {
        const trimmed = notes[listingId]?.trim();
        const payload: {
          listingId: string;
          action: ReviewAction;
          reviewNotes?: string | null;
        } = {
          listingId,
          action,
        };

        if (Object.prototype.hasOwnProperty.call(notes, listingId)) {
          payload.reviewNotes = trimmed ? trimmed : null;
        }

        const response = await fetch("/api/admin/listings/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              action?: string;
              listing?: { lifecycle_status?: string };
            }
          | null;

        if (!response.ok) {
          setFeedback((prev) => ({
            ...prev,
            [listingId]: {
              error: body?.error ?? `Request failed (${response.status})`,
            },
          }));
          return;
        }

        setFeedback((prev) => ({
          ...prev,
          [listingId]: {
            message: `Listing is now ${body?.listing?.lifecycle_status ?? action}.`,
          },
        }));
        router.refresh();
      } catch (error) {
        setFeedback((prev) => ({
          ...prev,
          [listingId]: {
            error:
              error instanceof Error ? error.message : "Review action failed.",
          },
        }));
      } finally {
        setActiveId(null);
      }
    });
  }

  if (listings.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-pine/30 bg-pine/5 p-4">
        <Icon name="check" size={18} className="text-pine" />
        <p className="text-sm font-medium text-pine">
          Queue clear — no host submissions waiting for review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {listings.map((listing) => {
        const isBusy = pending && activeId === listing.id;
        const state = feedback[listing.id] ?? {};
        const missingImage = !listing.main_image_url;
        const missingRules =
          !listing.official_rules_url;

        return (
          <div
            key={listing.id}
            className="rounded-card border border-line bg-surface p-4 shadow-e1"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {listing.title}
                </p>
                <p className="mt-1 text-xs text-graphite">
                  {listing.host_display_name ?? "Unknown host"}{" · "}Ends{" "}
                  {formatDate(listing.end_date)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                <span className="rounded-pill bg-pine/10 px-2 py-1 text-pine">
                  {listing.lifecycle_status}
                </span>
                <span className="rounded-pill border border-line px-2 py-1 text-graphite">
                  {listing.visibility_status}
                </span>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-graphite">
              {listing.short_description}
            </p>

            <dl className="mt-3 grid gap-1 text-xs text-graphite">
              <div className="flex items-center justify-between gap-3">
                <dt>Prize</dt>
                <dd className="font-medium text-ink">{listing.prize_name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Category</dt>
                <dd className="font-medium text-ink">
                  {listing.prize_category ?? "Uncategorized"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Entry URL</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink">
                  {listing.entry_url ?? "Missing"}
                </dd>
              </div>
            </dl>

            {missingImage || missingRules ? (
              <p className="mt-3 rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-xs text-flame">
                Publish blockers:{" "}
                {[
                  missingImage ? "main image" : null,
                  missingRules ? "official rules URL" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . Approving may be blocked by the publish guard until resolved.
              </p>
            ) : null}

            <label className="mt-3 flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Internal review notes</span>
              <textarea
                rows={2}
                maxLength={1000}
                defaultValue={listing.review_notes_internal ?? ""}
                onChange={(event) =>
                  setNotes((prev) => ({
                    ...prev,
                    [listing.id]: event.target.value,
                  }))
                }
                className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                placeholder="Optional notes (saved with reject / keep pending)."
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "approve")}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve &amp; publish
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "keep_pending")}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink/75 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep pending
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "reject")}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-flame/40 px-4 py-2.5 text-sm font-semibold text-flame transition hover:bg-flame/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            </div>

            {state.error ? (
              <p className="mt-3 rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-sm text-flame">
                {state.error}
              </p>
            ) : null}

            {state.message ? (
              <p className="mt-3 rounded-xl border border-pine/30 bg-pine/10 px-3 py-2 text-sm text-pine">
                {state.message}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
