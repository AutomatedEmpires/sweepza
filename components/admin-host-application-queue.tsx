"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { HostApplicationQueueItem } from "@/lib/db/host-applications";

function ApplicationCard({ item }: { item: HostApplicationQueueItem }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState("");

  async function review(action: "approve" | "reject") {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/host-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: item.id, action, reviewNotes: notes }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Review failed.");
      setMessage(action === "approve" ? "Host access approved." : "Application rejected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ember">
        {item.authority_basis} authority
      </p>
      <h3 className="mt-1 font-display text-lg font-bold text-ink">
        {item.public_display_name}
      </h3>
      <p className="text-xs text-graphite">
        Legal entity: {item.legal_organization_name}
      </p>
      <dl className="mt-4 grid gap-2 text-sm text-graphite">
        <div><dt className="font-semibold text-ink">Applicant</dt><dd>{item.applicantName} · {item.accountEmail ?? "No account email"}</dd></div>
        <div><dt className="font-semibold text-ink">Official email</dt><dd>{item.official_email}</dd></div>
        <div>
          <dt className="font-semibold text-ink">Website</dt>
          <dd><a href={item.website_url} target="_blank" rel="noreferrer" className="text-ember hover:underline">{item.website_url}</a></dd>
        </div>
        <div><dt className="font-semibold text-ink">Authority evidence</dt><dd className="whitespace-pre-wrap">{item.authority_evidence}</dd></div>
        {item.authority_evidence_url ? (
          <div>
            <dt className="font-semibold text-ink">Evidence link</dt>
            <dd><a href={item.authority_evidence_url} target="_blank" rel="noreferrer" className="text-ember hover:underline">Open evidence</a></dd>
          </div>
        ) : null}
      </dl>
      <label className="mt-4 block text-xs font-medium text-graphite">
        Decision notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          minLength={5}
          maxLength={2000}
          rows={3}
          className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none"
          placeholder="Record the verification checks and decision basis."
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => review("approve")} disabled={pending !== null || notes.trim().length < 5} className="min-h-11 rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending === "approve" ? "Approving…" : "Approve host"}
        </button>
        <button type="button" onClick={() => review("reject")} disabled={pending !== null || notes.trim().length < 5} className="min-h-11 rounded-xl border border-flame/40 px-4 py-2 text-sm font-semibold text-flame disabled:opacity-60">
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-graphite">{message}</p> : null}
    </article>
  );
}

export function AdminHostApplicationQueue({ items }: { items: HostApplicationQueueItem[] }) {
  return (
    <div className="mt-6">
      <h2 className="font-display text-xl font-bold text-ink">Authority applications</h2>
      {items.length === 0 ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-5 text-sm text-graphite shadow-e1">
          No host applications are waiting for review.
        </div>
      ) : (
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {items.map((item) => <ApplicationCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
