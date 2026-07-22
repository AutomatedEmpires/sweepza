"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminReportActions({
  reportId,
  targetType,
  targetLabel,
}: {
  reportId: string;
  targetType: string;
  targetLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  function run(action: "dismiss" | "act") {
    if (action === "act") {
      const consequence = targetType === "host"
        ? "suspend this host and hide every listing it owns"
        : targetType === "winner_post"
          ? "hide this Winner Wall post"
          : "hold this listing for correction and remove it from discovery";
      if (!window.confirm(`Confirm that you want to ${consequence}: ${targetLabel}`)) return;
    }
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/reports/${reportId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewNotes }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(body?.error ?? `Request failed (${response.status})`);
          return;
        }
        if (action === "act" && targetType === "host") {
          router.push("/admin/hosts");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="flex min-w-64 flex-col items-start gap-2">
      <textarea
        value={reviewNotes}
        onChange={(event) => setReviewNotes(event.target.value)}
        minLength={5}
        maxLength={2000}
        rows={2}
        placeholder="Required resolution notes"
        aria-label="Report resolution notes"
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-ember focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || reviewNotes.trim().length < 5}
          onClick={() => run("dismiss")}
          className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink/75 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={pending || reviewNotes.trim().length < 5}
          onClick={() => run("act")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-ember px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {targetType === "host"
            ? "Suspend host"
            : targetType === "winner_post"
              ? "Hide winner post"
              : "Hold listing"}
        </button>
      </div>
      {error ? <span className="text-[11px] text-flame">{error}</span> : null}
    </div>
  );
}
