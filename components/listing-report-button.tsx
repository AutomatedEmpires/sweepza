"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

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
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          setError(body?.error ?? `Report failed (${response.status})`);
          return;
        }
        setSubmitted(true);
        setOpen(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Report failed.");
      }
    });
  }

  const dialog = open && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-5">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
            onMouseDown={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id={`listing-report-dialog-${listingId}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`listing-report-title-${listingId}`}
            aria-describedby={`listing-report-description-${listingId}`}
            className="relative z-10 max-h-[min(88vh,680px)] w-full overflow-y-auto rounded-t-sheet border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-e3 sm:max-w-lg sm:rounded-sheet sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`listing-report-title-${listingId}`} className="font-display text-2xl text-ink">
                  Report this listing
                </h2>
                <p id={`listing-report-description-${listingId}`} className="mt-1 text-sm leading-relaxed text-graphite">
                  Flag a broken link, expired sweepstakes, inaccurate detail, or suspicious claim for review.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-autofocus={!isSignedIn || !clerkConfigured ? "true" : undefined}
                className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink"
                aria-label="Close report form"
              >
                <Icon name="skip" size={17} />
              </button>
            </div>

            {!clerkConfigured ? (
              <p className="mt-5 rounded-xl bg-ink/[0.04] p-4 text-sm text-graphite">
                Reporting is temporarily unavailable in this environment.
              </p>
            ) : !isSignedIn ? (
              <div className="mt-5 rounded-xl bg-ink/[0.04] p-4 text-sm text-graphite">
                <p>Sign in to send this listing to the Sweepza moderation team.</p>
                <Link
                  href="/sign-in"
                  className="mt-3 inline-flex min-h-11 items-center font-semibold text-pine"
                >
                  Sign in to report
                </Link>
              </div>
            ) : (
              <form action={submit} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink">Reason</span>
                  <select
                    name="reasonCode"
                    required
                    data-autofocus="true"
                    className="min-h-11 rounded-xl border border-line bg-paper px-3 py-2.5 text-ink"
                    defaultValue="broken_entry_link"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {REPORT_REASON_LABELS[reason]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink">Details <span className="font-normal text-graphite">(optional)</span></span>
                  <textarea
                    name="details"
                    rows={4}
                    maxLength={500}
                    className="rounded-xl border border-line bg-paper px-3 py-2.5 text-ink"
                    placeholder="What should our moderation team check?"
                  />
                </label>

                {error ? (
                  <p role="alert" className="rounded-xl bg-ember/10 p-3 text-sm text-ember">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-11 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Submitting report…" : "Submit report"}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  if (submitted) {
    return (
      <span
        role="status"
        className="absolute right-3 top-16 inline-flex min-h-11 items-center gap-1 rounded-full bg-ember px-3 py-2 text-xs font-semibold text-on-accent shadow-sm"
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
        onClick={() => {
          setError(null);
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        aria-controls={`listing-report-dialog-${listingId}`}
        aria-label="Report listing"
        className={cn(
          "absolute right-3 top-16 grid h-11 w-11 place-items-center rounded-full shadow-sm backdrop-blur transition",
          open ? "bg-ember text-on-accent" : "bg-surface/90 text-ink/70",
        )}
      >
        <Icon name="flag" size={18} />
      </button>
      {dialog}
    </>
  );
}
