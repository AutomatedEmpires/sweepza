"use client";

import { useState, useTransition } from "react";

export interface WinnerListingOption {
  id: string;
  title: string;
  endDate?: string;
}

function formatOptionDate(date: string | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function WinnerSubmissionForm({
  listings,
}: {
  listings: WinnerListingOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  function submit(formData: FormData) {
    const listingId = String(formData.get("listingId") ?? "").trim();
    const payload = {
      listingId: listingId || null,
      caption: String(formData.get("caption") ?? ""),
      photoUrl: String(formData.get("photoUrl") ?? "").trim() || null,
    };

    startTransition(async () => {
      setResult({});

      try {
        const response = await fetch("/api/winners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          setResult({ error: body?.error ?? `Submission failed (${response.status})` });
          return;
        }

        setResult({
          success:
            "Your win was submitted for review. It will appear on the Winner Wall once Sweepza approves it.",
        });
      } catch (error) {
        setResult({
          error:
            error instanceof Error
              ? error.message
              : "Winner submission failed.",
        });
      }
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-card border border-sand bg-white/80 p-4"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Share your win</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Post a real prize you won through Sweepza. Submissions are reviewed before they go public.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Sweep listing</span>
        <select
          name="listingId"
          defaultValue=""
          className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
        >
          <option value="">Choose a listing you entered</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.title}
              {listing.endDate ? ` · Ended ${formatOptionDate(listing.endDate)}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Caption</span>
        <textarea
          name="caption"
          required
          rows={5}
          maxLength={1000}
          className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          placeholder="Tell the community what you won and how it landed."
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Photo URL</span>
        <input
          name="photoUrl"
          type="url"
          className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          placeholder="Optional photo of the prize or confirmation"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting..." : "Submit winner post"}
        </button>
        <p className="text-xs text-ink/50">
          Verified-win status is applied later during review.
        </p>
      </div>

      {result.error ? (
        <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
          {result.error}
        </p>
      ) : null}

      {result.success ? (
        <p className="rounded-xl border border-moss/30 bg-moss/10 px-3 py-2 text-sm text-moss">
          {result.success}
        </p>
      ) : null}
    </form>
  );
}
