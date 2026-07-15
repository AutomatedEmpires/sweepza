"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminReportActions({
  reportId,
  targetType,
}: {
  reportId: string;
  targetType: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: "dismiss" | "act") {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/reports/${reportId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
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
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("dismiss")}
          className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink/75 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("act")}
          className="rounded-xl bg-ember px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Act
        </button>
      </div>
      {error ? <span className="text-[11px] text-flame">{error}</span> : null}
    </div>
  );
}
