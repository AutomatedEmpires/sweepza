"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReportQueueItem } from "@/lib/db/report-queue";
import type { ReportReviewAction } from "@/lib/report-review-schema";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-ink/5 text-ink/60",
  ai_triage: "bg-ink/5 text-ink/60",
  admin_review: "bg-moss/10 text-moss",
  escalated: "bg-ember/10 text-ember",
  action_taken: "bg-moss/10 text-moss",
  resolved: "bg-moss/10 text-moss",
  dismissed: "bg-ink/5 text-ink/60",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-ink/5 text-ink/60",
  medium: "bg-ink/5 text-ink/60",
  high: "bg-ember/10 text-ember",
  critical: "bg-ember/10 text-ember",
};

export function AdminReportsQueue({ reports }: { reports: ReportQueueItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<
    Record<string, { error?: string; message?: string }>
  >({});

  function runAction(reportId: string, action: ReportReviewAction) {
    setActiveId(reportId);
    startTransition(async () => {
      setFeedback((prev) => ({ ...prev, [reportId]: {} }));
      try {
        const trimmed = notes[reportId]?.trim();
        const payload: {
          reportId: string;
          action: ReportReviewAction;
          resolutionNotes?: string | null;
        } = { reportId, action };

        if (Object.prototype.hasOwnProperty.call(notes, reportId)) {
          payload.resolutionNotes = trimmed ? trimmed : null;
        }

        const response = await fetch("/api/admin/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string; report?: { status?: string } }
          | null;
        if (!response.ok) {
          setFeedback((prev) => ({
            ...prev,
            [reportId]: {
              error: body?.error ?? `Request failed (${response.status})`,
            },
          }));
          return;
        }
        setFeedback((prev) => ({
          ...prev,
          [reportId]: {
            message: `Report is now ${body?.report?.status ?? action}.`,
          },
        }));
        router.refresh();
      } catch (error) {
        setFeedback((prev) => ({
          ...prev,
          [reportId]: {
            error:
              error instanceof Error ? error.message : "Report action failed.",
          },
        }));
      } finally {
        setActiveId(null);
      }
    });
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-card border border-sand bg-white/70 p-4">
        <p className="text-sm leading-relaxed text-ink/60">
          No open community reports right now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => {
        const isBusy = pending && activeId === report.id;
        const state = feedback[report.id] ?? {};
        const statusClass =
          STATUS_BADGE[report.status] ?? "bg-ink/5 text-ink/60";
        const severityClass = report.ai_severity
          ? SEVERITY_BADGE[report.ai_severity] ?? "bg-ink/5 text-ink/60"
          : null;
        const isListing = report.target_type === "listing";

        return (
          <div
            key={report.id}
            className="rounded-card border border-sand bg-white/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {report.reason_code}
                </p>
                <p className="mt-1 text-xs text-ink/55">
                  {report.target_type}
                  {" \u00b7 "}
                  Reported {formatDateTime(report.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                <span className={`rounded-full px-2 py-1 ${statusClass}`}>
                  {report.status}
                </span>
                {severityClass ? (
                  <span className={`rounded-full px-2 py-1 ${severityClass}`}>
                    {report.ai_severity}
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink/75">
              {report.details ?? "No additional details provided."}
            </p>

            <dl className="mt-3 grid gap-1 text-xs text-ink/60">
              <div className="flex items-center justify-between gap-3">
                <dt>Reported by</dt>
                <dd className="font-medium text-ink/80">
                  {report.reporter_display_name ?? "Unknown member"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Reported listing</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink/80">
                  {isListing && report.listing_slug ? (
                    <Link
                      href={`/sweeps/${report.listing_slug}`}
                      className="text-moss underline-offset-2 hover:underline"
                    >
                      {report.listing_title ?? report.listing_slug}
                    </Link>
                  ) : isListing ? (
                    "Listing not found"
                  ) : (
                    `${report.target_type}`
                  )}
                </dd>
              </div>
            </dl>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Internal notes</span>
              <textarea
                rows={2}
                maxLength={1000}
                defaultValue={report.resolution_notes_internal ?? ""}
                onChange={(event) =>
                  setNotes((prev) => ({
                    ...prev,
                    [report.id]: event.target.value,
                  }))
                }
                className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
                placeholder="Optional notes (saved with the chosen action)."
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(report.id, "open")}
                className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark open
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(report.id, "resolve")}
                className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Resolve
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(report.id, "dismiss")}
                className="rounded-full border border-ember/40 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Dismiss
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
