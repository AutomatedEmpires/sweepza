import Link from "next/link";
import { getHostAnalytics } from "@/lib/db/host-dashboard";

export const metadata = { title: "Host Analytics" };

function deltaLabel(delta: number | null) {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}%`;
}

export default async function HostAnalyticsPage() {
  const analytics = await getHostAnalytics();

  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Analytics</h1>
          <p className="mt-2 text-sm text-ink/60">How your listings are performing.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">
          Back
        </Link>
      </header>

      <div className="mt-6 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-xs font-semibold text-ink/60">Total saves</p>
            <p className="mt-2 text-2xl font-bold text-ink">{analytics.totalSaves}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-xs font-semibold text-ink/60">Total entries</p>
            <p className="mt-2 text-2xl font-bold text-ink">{analytics.totalEnters}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold text-ink/60">Entries trend</p>
          <p className="mt-2 text-sm text-ink/70">
            This week: <span className="font-semibold text-ink">{analytics.entriesThisWeek}</span> · Last week:{" "}
            <span className="font-semibold text-ink">{analytics.entriesLastWeek}</span> · Delta:{" "}
            <span className="font-semibold text-ink">{deltaLabel(analytics.entriesWeekDeltaPct)}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold text-ink/60">Top listing</p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {analytics.topListing?.title ?? "—"}
          </p>
          <p className="mt-1 text-xs text-ink/60">
            Entries: {analytics.topListing?.enterCount ?? "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold text-ink/60">Per-listing conversion</p>
          <div className="mt-3 grid gap-2">
            {analytics.perListing.length === 0 ? (
              <p className="text-sm text-ink/50">No listings yet.</p>
            ) : (
              analytics.perListing.map((row) => (
                <div key={row.listingId} className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                  <p className="shrink-0 text-xs text-ink/60">
                    {row.enterCount} enters · {row.viewCount} views · {row.conversionRatePct}%
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
