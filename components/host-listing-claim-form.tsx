"use client";

import { useState } from "react";

const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none";

export function HostListingClaimForm({ defaultListingId }: { defaultListingId: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/host/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: form.get("listingId"),
          authorityBasis: form.get("authorityBasis"),
          authorityEvidence: form.get("authorityEvidence"),
          authorityEvidenceUrl: form.get("authorityEvidenceUrl"),
          authorityAttested: form.get("authorityAttested") === "on",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.error ?? "Claim request failed.");
        return;
      }
      setStatus("success");
      setMessage("Claim submitted for authority review.");
    } catch {
      setStatus("error");
      setMessage("The claim request could not be sent. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-e1">
      <h2 className="font-display text-xl font-bold text-ink">Claim an existing listing</h2>
      <p className="text-sm leading-relaxed text-graphite">Claims transfer listing management only after Sweepza verifies your authority. Original source provenance remains attached.</p>
      <label className="block text-xs font-medium text-graphite">Listing ID<input name="listingId" defaultValue={defaultListingId} className={inputClass} required /></label>
      <label className="block text-xs font-medium text-graphite">Authority basis<input name="authorityBasis" className={inputClass} placeholder="Sponsor employee, promotion administrator, authorized agency…" minLength={5} maxLength={120} required /></label>
      <label className="block text-xs font-medium text-graphite">Authority evidence<textarea name="authorityEvidence" className={inputClass} rows={5} minLength={20} maxLength={2000} required /></label>
      <label className="block text-xs font-medium text-graphite">Evidence URL (optional)<input name="authorityEvidenceUrl" type="url" className={inputClass} placeholder="https://..." /></label>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm leading-relaxed text-ink"><input name="authorityAttested" type="checkbox" required className="mt-1" />I attest that I am authorized to manage this promotion on behalf of its sponsor or administrator.</label>
      {message ? <p role="status" className={status === "error" ? "text-sm text-flame" : "text-sm text-pine"}>{message}</p> : null}
      <button type="submit" disabled={status === "submitting" || status === "success"} className="min-h-11 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{status === "submitting" ? "Submitting…" : "Submit claim"}</button>
    </form>
  );
}
