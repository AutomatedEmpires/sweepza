import { Icon } from "@/components/icon";
import { OfficialDestinationPolicyConsole } from "@/components/official-destination-policy-console";
import { OfficialUrlIntakeConsole } from "@/components/official-url-intake-console";
import { OfficialUrlIntakeStatus } from "@/components/official-url-intake-status";
import { ensureCurrentAppUser } from "@/lib/auth";
import { listCurrentOfficialDestinationPolicies } from "@/lib/db/official-destination-policy";
import {
  getOfficialUrlIntakeBacklogStatus,
  type OfficialUrlIntakeBacklogStatus,
} from "@/lib/db/official-url-intake-status";
import { getSourceHealth, type SourceHealthRow } from "@/lib/db/source-health";
import type { OfficialDestinationPolicy } from "@/lib/ingestion/official-destination-policy";

export const metadata = {
  title: "Source Health",
  description: "Ingestion source policy, approval records, preflight gates, and run health.",
};

export const dynamic = "force-dynamic";

function StateBadge({ state }: { state: string | null }) {
  if (!state) {
    return (
      <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-graphite">
        no record
      </span>
    );
  }
  const isProduction = state === "approved_for_production";
  const isBlocked = state === "blocked" || state === "revoked" || state === "paused";
  const cls = isProduction
    ? "border-pine/30 bg-pine/10 text-pine"
    : isBlocked
      ? "border-flame/30 bg-flame/10 text-flame"
      : "border-line bg-paper text-graphite";
  return (
    <span className={`rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function SourceCard({ row }: { row: SourceHealthRow }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold text-ink">{row.label}</h3>
            <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-graphite">
              {row.tier}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-graphite">{row.id}</p>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold ${
            row.gate.allowed
              ? "bg-pine/10 text-pine"
              : "bg-paper text-graphite"
          }`}
        >
          <Icon name={row.gate.allowed ? "check" : "shield"} size={14} />
          {row.gate.allowed ? "Preflight gate passes" : "Gated"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-graphite">Compliance</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-graphite">policy floor</span>
            <StateBadge state={row.registryState} />
            <span className="text-xs text-graphite">approval record</span>
            <StateBadge state={row.recordState} />
          </div>
          {row.approvedBy ? (
            <p className="mt-1 text-xs text-graphite">
              approved by {row.approvedBy} · {formatWhen(row.approvedAt)}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-graphite">Posture</p>
          <p className="mt-1 text-xs text-ink">
            robots: <span className="text-graphite">{row.robotsPosture.replace(/_/g, " ")}</span>
            {"  ·  "}
            ToS: <span className="text-graphite">{row.tosPosture.replace(/_/g, " ")}</span>
          </p>
          <p className="mt-1 text-xs text-ink">
            budget {row.requestBudgetPerRun}/run · refresh every {Math.round(row.refreshIntervalMinutes / 60)}h
          </p>
        </div>
      </div>

      {/* Circuit breaker + failures */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {row.killSwitch ? (
          <span className="rounded-pill border border-flame/30 bg-flame/10 px-2 py-0.5 font-semibold text-flame">
            kill switch engaged
          </span>
        ) : null}
        {row.circuitOpenedAt ? (
          <span className="rounded-pill border border-flame/30 bg-flame/10 px-2 py-0.5 font-semibold text-flame">
            circuit open since {formatWhen(row.circuitOpenedAt)}
          </span>
        ) : null}
        {row.consecutiveFailures > 0 ? (
          <span className="text-graphite">{row.consecutiveFailures} consecutive failures</span>
        ) : null}
        {row.lastFailureClass ? (
          <span className="text-graphite">last failure: {row.lastFailureClass}</span>
        ) : null}
      </div>

      {/* Gate reason */}
      {!row.gate.allowed ? (
        <p className="mt-3 rounded-xl border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-graphite">
          {row.gate.detail}
        </p>
      ) : null}

      {/* Recent runs */}
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-graphite">
          Recent runs
        </p>
        {row.recentRuns.length === 0 ? (
          <p className="mt-1 text-xs text-graphite">No runs recorded.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {row.recentRuns.map((run, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink">
                <span className="font-mono text-graphite">{formatWhen(run.startedAt)}</span>
                <span
                  className={`font-semibold ${
                    run.status === "ok"
                      ? "text-pine"
                      : run.status === "skipped"
                        ? "text-graphite"
                        : "text-flame"
                  }`}
                >
                  {run.status}
                </span>
                <span className="text-graphite">
                  {run.discovered} found · {run.created} created · {run.failed} failed · {run.requestsMade} reqs
                  {run.notModified > 0 ? ` · ${run.notModified} unchanged` : ""}
                </span>
                {run.notes ? (
                  <span className="basis-full break-words text-graphite">
                    {run.notes}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default async function AdminSourcesPage() {
  const authUser = await ensureCurrentAppUser();
  if (
    !authUser ||
    (!authUser.appUser.is_admin && !authUser.appUser.is_owner)
  ) {
    return null;
  }

  const health = await getSourceHealth();
  let officialUrlIntakeStatus: OfficialUrlIntakeBacklogStatus | null = null;
  let officialUrlIntakeStatusReadable = false;
  try {
    officialUrlIntakeStatus = await getOfficialUrlIntakeBacklogStatus();
    officialUrlIntakeStatusReadable = true;
  } catch {
    // Keep status visibly unavailable; never infer queue health from a failed read.
  }
  let officialDestinationPolicies: OfficialDestinationPolicy[] = [];
  let officialDestinationPoliciesReadable = false;
  try {
    officialDestinationPolicies =
      await listCurrentOfficialDestinationPolicies();
    officialDestinationPoliciesReadable = true;
  } catch {
    // Keep the console useful while preserving fail-closed policy semantics.
  }
  const productionApproved = health.rows.filter(
    (r) => r.registryState === "approved_for_production" && r.recordState === "approved_for_production",
  ).length;

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Source health</h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Every ingestion source, its compliance state, and the result of its preflight gate.
          Execution also requires the database run lease, so a passing preflight gate is never shown
          as authority to run.
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold ${
            health.ingestionEnabled ? "bg-pine/10 text-pine" : "bg-paper text-graphite"
          }`}
        >
          <Icon name="shield" size={14} />
          INGESTION_ENABLED: {health.ingestionEnabled ? "true" : "not set (dark)"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3 py-1 text-xs font-semibold text-graphite">
          {productionApproved} sources production-approved
        </span>
      </div>

      {!health.tablesPresent ? (
        <p className="mt-4 rounded-card border border-line bg-paper px-4 py-3 text-sm text-graphite">
          Operational data is only partially readable in this environment. Approval records are{" "}
          {health.registryReadable ? "available" : "unavailable"}; run history is{" "}
          {health.runsReadable ? "available" : "unavailable"}; the durable work queue is{" "}
          {health.queueReadable ? "available" : "unavailable"}. The static code-level policy floor
          remains visible, but an unavailable read is never treated as approval.
        </p>
      ) : null}

      <OfficialUrlIntakeStatus
        status={officialUrlIntakeStatus}
        readable={officialUrlIntakeStatusReadable}
      />

      <OfficialUrlIntakeConsole />

      <OfficialDestinationPolicyConsole
        policies={officialDestinationPolicies}
        readable={officialDestinationPoliciesReadable}
      />

      <div className="mt-5 grid gap-4">
        {health.rows.map((row) => (
          <SourceCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}
