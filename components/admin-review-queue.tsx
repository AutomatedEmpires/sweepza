"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
      <div className="rounded-card border border-sand bg-white/70 p-4">
        <p className="text-sm leading-relaxed text-ink/60">
          No host-submitted listings are waiting for review right now.
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
          !listing.official_rules_url && !listing.official_rules_exception;

        return (
          <div
            key={listing.id}
            className="rounded-card border border-sand bg-white/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {listing.title}
                </p>
                <p className="mt-1 text-xs text-ink/55">
                  {listing.host_display_name ?? "Unknown host"}{" \u00b7 "}Ends{" "}
                  {formatDate(listing.end_date)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                <span className="rounded-full bg-moss/10 px-2 py-1 text-moss">
                  {listing.lifecycle_status}
                </span>
                <span className="rounded-full bg-ink/5 px-2 py-1 text-ink/60">
                  {listing.visibility_status}
                </span>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink/65">
              {listing.short_description}
            </p>

            <dl className="mt-3 grid gap-1 text-xs text-ink/60">
              <div className="flex items-center justify-between gap-3">
                <dt>Prize</dt>
                <dd className="font-medium text-ink/80">{listing.prize_name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Category</dt>
                <dd className="font-medium text-ink/80">
                  {listing.prize_category ?? "Uncategorized"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Entry URL</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink/80">
                  {listing.entry_url ?? "Missing"}
                </dd>
              </div>
            </dl>

            {missingImage || missingRules ? (
              <p className="mt-3 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember">
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
                className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
                placeholder="Optional notes (saved with reject / keep pending)."
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "approve")}
                className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve &amp; publish
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "keep_pending")}
                className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep pending
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(listing.id, "reject")}
                className="rounded-full border border-ember/40 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            </div>

            {state.error ? (
              <p className="mt-3 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
                {state.error}
              </p>
            ) : null}

            {state.message ? (
              <p className="mt-3 rounded-xl border border-moss/30 bg-moss/10 px-3 py-2 text-sm text-moss">
                {state.message}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
