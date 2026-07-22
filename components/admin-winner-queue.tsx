"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { WinnerModerationQueueItem } from "@/lib/db/winners";

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember/30";

function WinnerReviewCard({ item }: { item: WinnerModerationQueueItem }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [verifiedWin, setVerifiedWin] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [pending, setPending] = useState<"publish" | "reject" | null>(null);
  const [message, setMessage] = useState("");

  async function moderate(action: "publish" | "reject") {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/winners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          winnerPostId: item.id,
          action,
          verifiedWin: action === "publish" && verifiedWin,
          reviewNotes: notes || undefined,
          verificationEvidenceUrl:
            action === "publish" && verifiedWin ? evidenceUrl : undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Moderation failed.");
      }
      setMessage(action === "publish" ? "Published." : "Rejected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Moderation failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ember">
            {item.reviewStatus.replace("_", " ")}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-ink">
            {item.memberName}
          </h2>
          {item.memberEmail ? (
            <p className="text-xs text-graphite">{item.memberEmail}</p>
          ) : null}
        </div>
        <time className="text-xs text-graphite" dateTime={item.createdAt}>
          {new Date(item.createdAt).toLocaleString()}
        </time>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {item.caption}
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {item.listingSlug ? (
          <Link
            href={`/sweeps/${item.listingSlug}`}
            target="_blank"
            className="font-semibold text-ember underline-offset-2 hover:underline"
          >
            Listing: {item.listingTitle}
          </Link>
        ) : (
          <span className="text-flame">Listing unavailable</span>
        )}
        {item.photoUrl ? (
          <a
            href={item.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ember underline-offset-2 hover:underline"
          >
            Review submitted photo
          </a>
        ) : (
          <span className="text-graphite">No photo submitted</span>
        )}
      </div>

      <div className="mt-5 space-y-3 border-t border-line pt-4">
        <label className="block text-xs font-medium text-graphite">
          Reviewer notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`${inputClass} mt-1`}
            maxLength={2000}
            rows={3}
            placeholder="Required when rejecting; retained in the audit trail."
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={verifiedWin}
            onChange={(event) => setVerifiedWin(event.target.checked)}
            className="h-4 w-4 rounded border-line text-ember focus:ring-ember"
          />
          Evidence independently verifies this win
        </label>

        {verifiedWin ? (
          <label className="block text-xs font-medium text-graphite">
            Verification evidence URL
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              className={`${inputClass} mt-1`}
              placeholder="https://..."
              required
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => moderate("publish")}
            disabled={pending !== null || (verifiedWin && !evidenceUrl)}
            className="min-h-11 rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => moderate("reject")}
            disabled={pending !== null || !notes.trim()}
            className="min-h-11 rounded-xl border border-flame/40 px-4 py-2 text-sm font-semibold text-flame disabled:opacity-60"
          >
            {pending === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
        {message ? (
          <p role="status" className="text-sm text-graphite">
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function AdminWinnerQueue({
  items,
}: {
  items: WinnerModerationQueueItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-line bg-surface p-6 text-sm text-graphite shadow-e1">
        No Winner Wall submissions are waiting for review.
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <WinnerReviewCard key={item.id} item={item} />
      ))}
    </div>
  );
}
