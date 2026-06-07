import {
  getHostSnapshot,
  getPlatformSnapshot,
  getRecentListings,
  getReportSnapshot,
  getWinnerSnapshot,
} from "@/lib/db/admin";

export const metadata = {
  title: "Admin Dashboard",
  description: "Platform snapshot and recent activity for Sweepza admins.",
};

export const dynamic = "force-dynamic";

function StatCard({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-sand bg-white/80 p-5">
      <p
        className={`text-3xl font-bold ${accent ? "text-ember" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
        {label}
      </p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminDashboardPage() {
  const [platform, hosts, winners, reports, recent] = await Promise.all([
    getPlatformSnapshot(),
    getHostSnapshot(),
    getWinnerSnapshot(),
    getReportSnapshot(),
    getRecentListings(),
  ]);

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Command center</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          A live snapshot of listings, hosts, winners, and moderation across
          Sweepza.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ink/55">
            Platform
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard value={platform.total_listings} label="Total listings" />
            <StatCard value={platform.active_listings} label="Active &amp; public" />
            <StatCard
              value={platform.pending_review_listings}
              label="Pending review"
              accent={platform.pending_review_listings > 0}
            />
            <StatCard
              value={platform.held_listings}
              label="Held (under review)"
              accent={platform.held_listings > 0}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ink/55">
            Hosts
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard value={hosts.total_hosts} label="Total hosts" />
            <StatCard value={hosts.verified_hosts} label="Admin verified" />
            <StatCard
              value={hosts.pending_verification}
              label="Pending verification"
              accent={hosts.pending_verification > 0}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ink/55">
            Winners &amp; reports
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              value={winners.pending_winner_posts}
              label="Pending winner posts"
              accent={winners.pending_winner_posts > 0}
            />
            <StatCard
              value={winners.published_winner_posts}
              label="Published winners"
            />
            <StatCard
              value={reports.open_reports}
              label="Open reports"
              accent={reports.open_reports > 0}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ink/55">
            Recent listings
          </h2>
          <div className="rounded-card border border-sand bg-white/80 p-2">
            {recent.length === 0 ? (
              <p className="p-3 text-sm text-ink/60">No listings yet.</p>
            ) : (
              <ul className="divide-y divide-sand">
                {recent.map((listing) => (
                  <li
                    key={listing.id}
                    className="flex items-center justify-between gap-3 px-3 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {listing.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-ink/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
                        {listing.lifecycle_status}
                      </span>
                      <span className="text-xs text-ink/55">
                        {formatDate(listing.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
