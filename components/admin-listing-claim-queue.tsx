"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HostListingClaim } from "@/lib/db/listing-claims";

function ClaimCard({ claim }: { claim: HostListingClaim }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState("");
  async function review(action: "approve" | "reject") {
    setPending(action); setMessage("");
    const response = await fetch("/api/admin/listing-claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId: claim.id, action, reviewNotes: notes }) });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(null);
    if (!response.ok) { setMessage(payload?.error ?? "Review failed."); return; }
    setMessage(action === "approve" ? "Claim approved." : "Claim rejected."); router.refresh();
  }
  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ember">{claim.host?.verification_status ?? "unknown"} host</p>
      <h2 className="mt-1 font-display text-lg font-bold text-ink">{claim.host?.display_name ?? claim.requesting_host_id}</h2>
      {claim.listing?.slug ? <Link href={`/sweeps/${claim.listing.slug}`} target="_blank" className="mt-2 inline-block text-sm font-semibold text-ember">{claim.listing.title}</Link> : <p>{claim.listing_id}</p>}
      <p className="mt-3 text-sm font-semibold text-ink">{claim.authority_basis}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-graphite">{claim.authority_evidence}</p>
      {claim.authority_evidence_url ? <a href={claim.authority_evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-ember">Open evidence</a> : null}
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} minLength={5} maxLength={2000} rows={3} placeholder="Required decision notes" className="mt-4 w-full rounded-xl border border-line px-3 py-2 text-sm" />
      <div className="mt-3 flex gap-2"><button type="button" disabled={pending !== null || notes.trim().length < 5} onClick={() => review("approve")} className="min-h-11 rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve</button><button type="button" disabled={pending !== null || notes.trim().length < 5} onClick={() => review("reject")} className="min-h-11 rounded-xl border border-flame/40 px-4 py-2 text-sm font-semibold text-flame disabled:opacity-60">Reject</button></div>
      {message ? <p role="status" className="mt-2 text-sm text-graphite">{message}</p> : null}
    </article>
  );
}

export function AdminListingClaimQueue({ claims }: { claims: HostListingClaim[] }) {
  if (claims.length === 0) return <div className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-graphite shadow-e1">No listing claims are waiting for review.</div>;
  return <div className="mt-6 grid gap-4 xl:grid-cols-2">{claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}</div>;
}
