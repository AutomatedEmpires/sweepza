"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

export interface WinnerListingOption {
  id: string;
  title: string;
  endDate?: string;
}

export function WinnerSubmissionForm(props: {
  listings: WinnerListingOption[];
}) {
  const [listingId, setListingId] = useState(props.listings[0]?.id ?? "");
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

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
    } catch {
      setStatus("error");
      track("winner_submission_failed", { listing_id: listingId || null, error_type: "network" });
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-card border border-sand bg-cream p-4 text-sm text-ink/70">
        <p className="font-semibold text-ink">Submitted</p>
        <p className="mt-1">Your post is pending review. Once approved, it will appear on the Winner Wall.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-sand bg-white p-4">
      {props.listings.length > 0 ? (
        <div>
          <label className="text-xs font-medium text-ink/60">Sweepstakes you entered</label>
          <select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-sand px-3 py-2 text-sm"
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
        <label className="text-xs font-medium text-ink/60">Photo URL</label>
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          className="mt-1 w-full rounded-xl border border-sand px-3 py-2 text-sm"
          placeholder="https://..."
          inputMode="url"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink/60">Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="mt-1 w-full rounded-xl border border-sand px-3 py-2 text-sm"
          maxLength={500}
          rows={4}
          placeholder="Won this!"
        />
      </div>
      {status === "error" ? (
        <p className="text-xs text-red-600">Something went wrong. Try again.</p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting…" : "Submit win"}
      </button>
    </form>
  );
}
