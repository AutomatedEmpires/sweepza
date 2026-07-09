"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminHostActions({ hostId }: { hostId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: "verify" | "suspend") {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/admin/hosts/${hostId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
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
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("verify")}
          className="rounded-xl bg-pine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Verify
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("suspend")}
          className="rounded-xl border border-flame/40 px-3 py-1.5 text-xs font-semibold text-flame transition hover:bg-flame/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Suspend
        </button>
      </div>
      {error ? <span className="text-[11px] text-flame">{error}</span> : null}
    </div>
  );
}
