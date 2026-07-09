import Link from "next/link";
import { getHostAnalytics } from "@/lib/db/host-dashboard";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
  numeric = false,
}: {
  label: string;
  value: string;
  hint?: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
      <p className="text-xs font-medium uppercase tracking-wide text-graphite">{label}</p>
      <p className={`mt-2 font-display text-3xl text-ink ${numeric ? "nums" : ""}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-graphite">{hint}</p> : null}
    </div>
  );
}

export default async function HostAnalyticsPage() {
  const analytics = await getHostAnalytics();

  const deltaLabel =
    analytics.entriesWeekDeltaPct == null
      ? "No prior week data"
      : `${analytics.entriesWeekDeltaPct >= 0 ? "+" : ""}${analytics.entriesWeekDeltaPct}% vs last week`;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">Analytics</h1>
        <Link
          href="/host"
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
        >
          Dashboard
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total saves" value={String(analytics.totalSaves)} numeric />
        <StatCard label="Total entries" value={String(analytics.totalEnters)} numeric />
        <StatCard label="Entries this week" value={String(analytics.entriesThisWeek)} hint={deltaLabel} numeric />
        <StatCard
          label="Top listing"
          value={analytics.topListing ? analytics.topListing.title : "—"}
          hint={analytics.topListing ? `${analytics.topListing.enterCount} entries` : undefined}
        />
      </div>

      <h2 className="mb-3 mt-8 text-xs font-medium uppercase tracking-wide text-graphite">Per listing</h2>
      {analytics.perListing.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper px-4 py-6 text-center text-sm text-graphite">
          No listing activity yet.
        </p>
      ) : (
        <div className="space-y-3">
          {analytics.perListing.map((row) => (
            <div key={row.listingId} className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-ink">{row.title}</h3>
                <span className="nums text-sm font-semibold text-pine">{row.conversionRatePct}% conversion</span>
              </div>
              <p className="nums mt-1 text-sm text-graphite">{row.viewCount} views · {row.enterCount} entries</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
