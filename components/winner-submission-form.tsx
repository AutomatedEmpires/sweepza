"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { track } from "@/lib/analytics";
import { useSeekerState } from "@/lib/seeker-state";

export interface WinnerListingOption {
  id: string;
  title: string;
  endDate?: string;
}

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember/30";

export function WinnerSubmissionForm(props: {
  listings: WinnerListingOption[];
}) {
  const [listingId, setListingId] = useState(props.listings[0]?.id ?? "");
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const store = useSeekerState();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    track("winner_submission_started", { listing_id: listingId || null });
    setStatus("submitting");

    try {
      const res = await fetch("/api/winners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listingId || undefined, photoUrl, caption }),
      });
      if (!res.ok) throw new Error("Submission failed");

      setStatus("success");
      track("winner_submission_completed", { listing_id: listingId || null });
      // Reporting a win from a tracked listing also marks it Won in the
      // seeker's own state, so My Sweeps and Today stay consistent.
      if (listingId && store) store.setPrimaryState(listingId, "won");
    } catch {
      setStatus("error");
      track("winner_submission_failed", { listing_id: listingId || null, error_type: "network" });
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-e1"
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-pine/10 text-pine">
          <Icon name="check" size={26} />
        </div>
        <p className="font-display text-[20px] leading-none text-ink">Submitted</p>
        <p className="max-w-[38ch] text-sm leading-relaxed text-graphite">
          Your post is pending review. Once approved, it will appear on the
          Winner Wall.
        </p>
        <Link
          href="/winners"
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink/75 transition hover:bg-paper"
        >
          Back to Winner Wall <Icon name="trophy" size={15} />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-card border border-line bg-surface p-4 shadow-e1"
    >
      {props.listings.length > 0 ? (
        <div>
          <label
            htmlFor="winner-listing"
            className="text-xs font-medium text-graphite"
          >
            Sweepstakes you entered
          </label>
          <select
            id="winner-listing"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className={inputClass}
          >
            <option value="">— Select one —</option>
            {props.listings.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor="winner-photo-url" className="text-xs font-medium text-graphite">
          Photo URL
        </label>
        <input
          id="winner-photo-url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          className={inputClass}
          placeholder="https://..."
          inputMode="url"
        />
      </div>
      <div>
        <label htmlFor="winner-caption" className="text-xs font-medium text-graphite">
          Caption
        </label>
        <textarea
          id="winner-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className={inputClass}
          maxLength={500}
          rows={4}
          placeholder="Won this!"
        />
      </div>
      {status === "error" ? (
        <p role="alert" className="text-xs font-medium text-flame">
          Something went wrong. Try again.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex min-h-11 items-center justify-center w-full rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting…" : "Submit win"}
      </button>
    </form>
  );
}
