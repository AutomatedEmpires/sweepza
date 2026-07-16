"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { REPORT_REASONS, type ReportReason } from "@/lib/db/enums";
import { Icon } from "@/components/icon";

const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  scam_suspicious: "Scam or suspicious",
  broken_entry_link: "Broken entry link",
  expired_listing: "Listing is expired",
  duplicate_sweep: "Duplicate sweep",
  misleading_prize: "Misleading prize info",
  inappropriate_image: "Inappropriate image",
  spam: "Spam",
  fake_winner_claim: "Fake winner claim",
  host_advertising_winner_wall: "Host advertising Winner Wall",
  rules_issue: "Rules issue",
  eligibility_issue: "Eligibility issue",
  other: "Other",
};

export function ListingReportButton({
  listingId,
  clerkConfigured,
  isSignedIn,
}: {
  listingId: string;
  clerkConfigured: boolean;
  isSignedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const payload = {
      targetType: "listing",
      targetId: listingId,
      reasonCode: String(formData.get("reasonCode") ?? ""),
      details: String(formData.get("details") ?? "").trim() || undefined,
    };

    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          setError(body?.error ?? `Report failed (${response.status})`);
          return;
        }

        setSubmitted(true);
        setOpen(false);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Report failed.",
        );
      }
    });
  }

  if (submitted) {
    return (
      <span
        role="status"
        className="absolute right-3 top-16 inline-flex items-center gap-1 rounded-full bg-ember px-3 py-2 text-xs font-semibold text-on-accent shadow-sm"
      >
        <Icon name="flag" size={14} />
        Reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-pressed={open}
        aria-label={open ? "Close report form" : "Report listing"}
        className={cn(
          "absolute right-3 top-16 grid h-11 w-11 place-items-center rounded-full shadow-sm backdrop-blur transition",
          open ? "bg-ember text-on-accent" : "bg-surface/90 text-ink/70",
        )}
      >
        <Icon name="flag" size={18} />
      </button>

      {open ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-e1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Report this listing</p>
              <p className="mt-1 text-sm text-ink/60">
                Flag broken links, expired sweeps, or suspicious claims for review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink"
              aria-label="Close report form"
            >
              <Icon name="skip" size={16} />
            </button>
          </div>

          {!clerkConfigured ? (
            <p className="mt-3 text-sm text-ink/60">
              Reporting is unavailable until Clerk is configured in this environment.
            </p>
          ) : !isSignedIn ? (
            <div className="mt-3 text-sm text-ink/60">
              <p>Sign in to report listings to the Sweepza team.</p>
              <Link
                href="/sign-in"
                className="mt-2 inline-flex min-h-11 items-center font-semibold text-pine"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <form action={submit} className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Reason</span>
                <select
                  name="reasonCode"
                  required
                  className="min-h-11 rounded-xl border border-line bg-paper px-3 py-2 text-ink"
                  defaultValue="broken_entry_link"
                >
                  {REPORT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {REPORT_REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Details</span>
                <textarea
                  name="details"
                  rows={3}
                  maxLength={500}
                  className="rounded-xl border border-line bg-paper px-3 py-2 text-ink"
                  placeholder="Optional context for the moderation team."
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-11 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Submitting..." : "Submit report"}
                </button>
                {error ? (
                  <p role="alert" className="text-sm text-ember">
                    {error}
                  </p>
                ) : null}
              </div>
            </form>
          )}
        </div>
      ) : null}
    </>
  );
}
