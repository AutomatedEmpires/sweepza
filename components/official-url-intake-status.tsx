import type { OfficialUrlIntakeBacklogStatus } from "@/lib/db/official-url-intake-status";

function formatAge(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(minutes / 1_440);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
        {label}
      </dt>
      <dd className={`mt-1 font-display text-2xl font-bold ${tone}`}>{value}</dd>
    </div>
  );
}

export function OfficialUrlIntakeStatus({
  status,
  readable,
}: {
  status: OfficialUrlIntakeBacklogStatus | null;
  readable: boolean;
}) {
  return (
    <section
      aria-labelledby="official-url-intake-status-heading"
      className="mt-5 rounded-card border border-line bg-surface p-5 shadow-e1"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
            Queue operations
          </p>
          <h2
            id="official-url-intake-status-heading"
            className="mt-1 font-display text-lg font-bold text-ink"
          >
            Official URL intake backlog
          </h2>
        </div>
        {status ? (
          <time
            dateTime={status.sampledAt}
            className="text-xs text-graphite"
          >
            Snapshot {formatWhen(status.sampledAt)}
          </time>
        ) : null}
      </div>

      {!readable || !status ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-flame/30 bg-flame/10 px-3 py-3 text-sm text-flame"
        >
          Backlog status is unavailable. Queue state is not being inferred; check
          database connectivity and the work-claim migration before operating
          ingestion.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Pending" value={status.pending} />
            <Metric label="Deferred / retrying" value={status.retrying} />
            <Metric label="Completed" value={status.completed} tone="text-pine" />
            <Metric
              label="Dead-lettered"
              value={status.deadLettered}
              tone={status.deadLettered > 0 ? "text-flame" : "text-ink"}
            />
          </dl>

          <p className="mt-3 text-sm text-graphite">
            {status.oldestPendingAt &&
            status.oldestPendingAgeMinutes !== null ? (
              <>
                Oldest active item queued{" "}
                <time dateTime={status.oldestPendingAt}>
                  {formatWhen(status.oldestPendingAt)}
                </time>{" "}
                ({formatAge(status.oldestPendingAgeMinutes)} old).
              </>
            ) : (
              "No active intake backlog."
            )}
          </p>
        </>
      )}
    </section>
  );
}
