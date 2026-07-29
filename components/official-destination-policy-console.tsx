"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { OfficialDestinationPolicy } from "@/lib/ingestion/official-destination-policy";

const inputClass =
  "min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none";

function displayScope(policy: OfficialDestinationPolicy): string {
  return `${policy.includeSubdomains ? "*." : ""}${policy.hostname}${policy.pathPrefix}`;
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function normalizePathPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}

export function OfficialDestinationPolicyConsole({
  policies,
  readable,
}: {
  policies: OfficialDestinationPolicy[];
  readable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState("draft");
  const [result, setResult] = useState<{
    error?: string;
    success?: string;
  }>({});
  const mutationAttempt = useRef<{
    signature: string;
    idempotencyKey: string;
  } | null>(null);
  const productionApproval = state === "approved_for_production";

  function submit(formData: FormData) {
    const expiryDate = String(formData.get("reviewExpiresAt") ?? "").trim();
    const hostname = normalizeHostname(
      String(formData.get("hostname") ?? ""),
    );
    const pathPrefix = normalizePathPrefix(
      String(formData.get("pathPrefix") ?? "/"),
    );
    const includeSubdomains = formData.get("includeSubdomains") === "on";
    const expectedCurrentId =
      policies.find(
        (policy) =>
          policy.hostname === hostname &&
          policy.pathPrefix === pathPrefix &&
          policy.includeSubdomains === includeSubdomains,
      )?.id ?? null;
    const expectedLedgerVersion =
      policies.length > 0
        ? Math.max(...policies.map((policy) => policy.id))
        : null;
    const decision = {
      expectedCurrentId,
      expectedLedgerVersion,
      hostname,
      pathPrefix,
      includeSubdomains,
      complianceState: state,
      robotsPosture: String(formData.get("robotsPosture") ?? "unknown"),
      tosPosture: String(formData.get("tosPosture") ?? "unreviewed"),
      termsUrl: String(formData.get("termsUrl") ?? ""),
      robotsUrl: String(formData.get("robotsUrl") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      reviewExpiresAt: expiryDate
        ? new Date(`${expiryDate}T23:59:59.999Z`).toISOString()
        : null,
      productionApprovalConfirmed:
        formData.get("productionApprovalConfirmed") === "on",
    };
    const signature = JSON.stringify(decision);
    if (mutationAttempt.current?.signature !== signature) {
      mutationAttempt.current = {
        signature,
        idempotencyKey: globalThis.crypto.randomUUID(),
      };
    }
    const payload = {
      ...decision,
      idempotencyKey: mutationAttempt.current.idempotencyKey,
    };

    startTransition(async () => {
      setResult({});
      try {
        const response = await fetch(
          "/api/admin/ingestion/destinations",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!response.ok) {
          setResult({
            error: body?.error ?? `Request failed (${response.status})`,
          });
          return;
        }

        setResult({
          success:
            "Decision appended. Existing history was preserved and current policy was refreshed.",
        });
        mutationAttempt.current = null;
        router.refresh();
      } catch (error) {
        setResult({
          error:
            error instanceof Error
              ? error.message
              : "Destination decision failed.",
        });
      }
    });
  }

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
            Official destinations
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink">
            Fetch authority
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-graphite">
            Each sponsor host and path is denied until an admin or owner appends
            a reviewed decision. Decisions are immutable; pauses, renewals, and
            corrections are new events.
          </p>
        </div>
        <span
          className={`rounded-pill px-3 py-1 text-xs font-semibold ${
            readable
              ? "bg-pine/10 text-pine"
              : "bg-flame/10 text-flame"
          }`}
        >
          {readable ? `${policies.length} current scopes` : "Policy data unreadable"}
        </span>
      </div>

      {policies.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {policies.map((policy) => (
            <li
              key={policy.id}
              className="rounded-xl border border-line bg-paper px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <code className="break-all text-xs text-ink">
                  {displayScope(policy)}
                </code>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-graphite">
                  {policy.complianceState.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-graphite">
                robots {policy.robotsPosture.replace(/_/g, " ")} · ToS{" "}
                {policy.tosPosture.replace(/_/g, " ")}
              </p>
            </li>
          ))}
        </ul>
      ) : readable ? (
        <p className="mt-4 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-graphite">
          No destination is approved. Official-page fetching remains off.
        </p>
      ) : null}

      <form action={submit} className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Hostname</span>
            <input
              name="hostname"
              required
              placeholder="promotions.sponsor.com"
              autoCapitalize="none"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Path scope</span>
            <input
              name="pathPrefix"
              required
              defaultValue="/"
              autoCapitalize="none"
              className={inputClass}
            />
            <span className="text-xs text-graphite">
              Segment scope only; trailing slashes are normalized.
            </span>
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            name="includeSubdomains"
            type="checkbox"
            className="h-4 w-4 accent-ember"
          />
          Include every nested subdomain in this scope
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Decision</span>
            <select
              name="complianceState"
              value={state}
              onChange={(event) => setState(event.target.value)}
              className={inputClass}
            >
              <option value="draft">Draft</option>
              <option value="research_required">Research required</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved_for_fixtures">Fixtures only</option>
              <option value="approved_for_manual_check">Manual check only</option>
              <option value="approved_for_production">Approve production</option>
              <option value="paused">Pause</option>
              <option value="blocked">Block</option>
              <option value="revoked">Revoke</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Robots review</span>
            <select name="robotsPosture" defaultValue="unknown" className={inputClass}>
              <option value="unknown">Unknown</option>
              <option value="permissive">Permissive</option>
              <option value="permissive_with_delay">Permissive with delay</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Terms review</span>
            <select name="tosPosture" defaultValue="unreviewed" className={inputClass}>
              <option value="unreviewed">Unreviewed</option>
              <option value="permits_use">Permits use</option>
              <option value="prohibits_use">Prohibits use</option>
              <option value="requires_agreement">Requires agreement</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Terms evidence URL</span>
            <input
              name="termsUrl"
              type="url"
              placeholder="https://sponsor.com/terms"
              required={productionApproval}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Robots evidence URL</span>
            <input
              name="robotsUrl"
              type="url"
              placeholder="https://sponsor.com/robots.txt"
              required={productionApproval}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Decision reason</span>
            <textarea
              name="reason"
              rows={3}
              minLength={10}
              maxLength={2000}
              required
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Review expires</span>
            <input
              name="reviewExpiresAt"
              type="date"
              className={inputClass}
            />
          </label>
        </div>

        {productionApproval ? (
          <label className="flex items-start gap-2 rounded-xl border border-flame/30 bg-flame/10 p-3 text-sm text-ink">
            <input
              name="productionApprovalConfirmed"
              type="checkbox"
              required
              className="mt-0.5 h-4 w-4 accent-flame"
            />
            I confirm the recorded terms and robots evidence permits Sweepza to
            fetch this exact scope in production.
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !readable}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Recording…"
              : readable
                ? "Append decision"
                : "Policy data unavailable"}
          </button>
          {result.error ? (
            <span role="alert" className="text-sm text-flame">
              {result.error}
            </span>
          ) : null}
          {result.success ? (
            <span role="status" className="text-sm text-pine">
              {result.success}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
