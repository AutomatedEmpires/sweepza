import { Icon } from "@/components/icon";
import { getSourceHealth, type SourceHealthRow } from "@/lib/db/source-health";

export const metadata = {
  title: "Source Health",
  description: "Ingestion source registry, compliance states, and run health.",
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
          {row.gate.allowed ? "Would run" : "Gated"}
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default async function AdminSourcesPage() {
  const health = await getSourceHealth();
  const productionApproved = health.rows.filter(
    (r) => r.registryState === "approved_for_production" && r.recordState === "approved_for_production",
  ).length;

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Source health</h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Every ingestion source, its compliance state, and whether it would run right now.
          Ingestion executes only when the deployment switch, the reviewed policy floor, and the
          approval record all agree.
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
          The source registry tables are not readable yet (migrations not applied in this
          environment). Showing the code-level policy floor only; approval records and run history
          appear once <span className="font-mono text-xs">20260716120000_source_registry.sql</span>{" "}
          is applied.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4">
        {health.rows.map((row) => (
          <SourceCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}
