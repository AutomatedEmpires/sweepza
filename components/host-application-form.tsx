"use client";

import { useState } from "react";

import type { HostApplicationRow } from "@/lib/db/host-applications";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember/30";

export function HostApplicationForm({
  application,
  accountEmail,
  accountName,
}: {
  application: HostApplicationRow | null;
  accountEmail: string;
  accountName: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  if (
    application &&
    ["submitted", "under_review", "approved"].includes(application.status)
  ) {
    return (
      <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ember">
          Host application {application.status.replace("_", " ")}
        </p>
        <h2 className="mt-2 font-display text-xl font-bold text-ink">
          {application.public_display_name}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          {application.status === "approved"
            ? "Your authority review was approved. Refresh this page to open the host dashboard."
            : "Sweepza is reviewing the organization and authority evidence you submitted. Host tools remain locked until an operator approves it."}
        </p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      legalOrganizationName: form.get("legalOrganizationName"),
      publicDisplayName: form.get("publicDisplayName"),
      websiteUrl: form.get("websiteUrl"),
      officialEmail: form.get("officialEmail"),
      authorityBasis: form.get("authorityBasis"),
      authorityEvidence: form.get("authorityEvidence"),
      authorityEvidenceUrl: form.get("authorityEvidenceUrl"),
      authorityAttested: form.get("authorityAttested") === "on",
    };

    try {
      const response = await fetch("/api/host/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Application submission failed.");
      }
      setStatus("success");
      setMessage("Application submitted for authority review.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Application submission failed.");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-e1"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ember">
          Host authority review
        </p>
        <h2 className="mt-1 font-display text-xl font-bold text-ink">
          Apply for host access
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Host access is granted only to promotion sponsors, administrators, or
          authorized representatives. Approval does not make Sweepza the
          promotion operator.
        </p>
        {application?.status === "rejected" ? (
          <div className="mt-3 rounded-xl border border-flame/30 bg-flame/5 p-3 text-sm text-graphite">
            Your prior application was not approved.
            {application.review_notes ? ` Reviewer notes: ${application.review_notes}` : ""}
            {" "}You may submit corrected evidence below.
          </div>
        ) : null}
      </div>

      <label className="block text-xs font-medium text-graphite">
        Legal organization name
        <input name="legalOrganizationName" className={inputClass} minLength={2} maxLength={160} required />
      </label>
      <label className="block text-xs font-medium text-graphite">
        Public sponsor or host name
        <input name="publicDisplayName" className={inputClass} defaultValue={accountName} minLength={2} maxLength={100} required />
      </label>
      <label className="block text-xs font-medium text-graphite">
        Official organization website
        <input name="websiteUrl" type="url" className={inputClass} placeholder="https://example.com" required />
      </label>
      <label className="block text-xs font-medium text-graphite">
        Official organization email
        <input name="officialEmail" type="email" className={inputClass} defaultValue={accountEmail} required />
      </label>
      <label className="block text-xs font-medium text-graphite">
        Your authority
        <select name="authorityBasis" className={inputClass} required defaultValue="">
          <option value="" disabled>Select your relationship</option>
          <option value="owner">Organization owner</option>
          <option value="employee">Authorized employee</option>
          <option value="agency">Authorized agency representative</option>
          <option value="administrator">Promotion administrator</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-graphite">
        Authority evidence
        <textarea
          name="authorityEvidence"
          className={inputClass}
          minLength={20}
          maxLength={2000}
          rows={5}
          placeholder="Explain your role, the promotion(s) you manage, and how Sweepza can verify your authority."
          required
        />
      </label>
      <label className="block text-xs font-medium text-graphite">
        Public evidence URL (optional)
        <input name="authorityEvidenceUrl" type="url" className={inputClass} placeholder="https://example.com/team-or-promotion" />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm leading-relaxed text-ink">
        <input name="authorityAttested" type="checkbox" className="mt-1 h-4 w-4" required />
        <span>
          I attest that I am authorized to represent this organization and that
          the submitted information is accurate. I understand Sweepza may
          verify this evidence and revoke access for false claims.
        </span>
      </label>

      {message ? (
        <p role="status" className={status === "error" ? "text-sm text-flame" : "text-sm text-pine"}>
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting" || status === "success"}
        className="min-h-11 w-full rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
