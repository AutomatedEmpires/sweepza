import Link from "next/link";
import { getHostAnalytics } from "@/lib/db/host-dashboard";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <Link href="/host" className="text-sm text-indigo-600 hover:underline">Back to dashboard</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total saves" value={String(analytics.totalSaves)} />
        <StatCard label="Total entries" value={String(analytics.totalEnters)} />
        <StatCard label="Entries this week" value={String(analytics.entriesThisWeek)} hint={deltaLabel} />
        <StatCard
          label="Top listing"
          value={analytics.topListing ? analytics.topListing.title : "—"}
          hint={analytics.topListing ? `${analytics.topListing.enterCount} entries` : undefined}
        />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-medium text-gray-800">Per listing</h2>
      {analytics.perListing.length === 0 ? (
        <p className="text-sm text-gray-500">No listing activity yet.</p>
      ) : (
        <div className="space-y-3">
          {analytics.perListing.map((row) => (
            <div key={row.listingId} className="rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{row.title}</h3>
                <span className="text-sm text-gray-500">{row.conversionRatePct}% conversion</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{row.viewCount} views · {row.enterCount} entries</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
