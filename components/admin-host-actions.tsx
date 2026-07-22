"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminHostActions({ hostId }: { hostId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  function run(action: "verify" | "suspend") {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/hosts/${hostId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes,
            ...(action === "verify" ? { evidenceUrl } : {}),
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(body?.error ?? `Request failed (${response.status})`);
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
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
        minLength={5}
        maxLength={2000}
        placeholder="Required decision notes"
        aria-label="Host decision notes"
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-ember focus:outline-none"
      />
      <input
        value={evidenceUrl}
        onChange={(event) => setEvidenceUrl(event.target.value)}
        type="url"
        placeholder="HTTPS verification evidence"
        aria-label="Host verification evidence URL"
        className="min-h-11 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-ember focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || notes.trim().length < 5 || !evidenceUrl.startsWith("https://")}
          onClick={() => run("verify")}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-pine px-3 py-1.5 text-xs font-semibold text-on-trust transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Verify
        </button>
        <button
          type="button"
          disabled={pending || notes.trim().length < 5}
          onClick={() => run("suspend")}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-flame/40 px-3 py-1.5 text-xs font-semibold text-flame transition hover:bg-flame/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Suspend
        </button>
      </div>
      {error ? <span className="text-[11px] text-flame">{error}</span> : null}
    </div>
  );
}
