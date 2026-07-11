import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
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
  tone,
}: {
  value: number;
  label: string;
  tone?: "ember" | "flame";
}) {
  const toneClass =
    tone === "flame" ? "text-flame" : tone === "ember" ? "text-ember" : "text-ink";
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <p className={`font-display nums text-3xl font-bold ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-graphite">
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
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Command center
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          A live snapshot of listings, hosts, winners, and moderation across
          Sweepza.
        </p>
      </header>

      {/* Needs attention — actionable queues dominate; stats support. */}
      {(() => {
        const queues: {
          count: number;
          label: string;
          href: string;
          icon: IconName;
        }[] = [
          {
            count: platform.pending_review_listings,
            label: "Listings pending review",
            href: "/admin/listings",
            icon: "rules",
          },
          {
            count: platform.held_listings,
            label: "Listings held under review",
            href: "/admin/listings",
            icon: "flag",
          },
          {
            count: platform.stale_active_listings,
            label: "Active listings past their end date",
            href: "/admin/listings",
            icon: "clock",
          },
          {
            count: hosts.pending_verification,
            label: "Hosts awaiting verification",
            href: "/admin/hosts",
            icon: "host",
          },
          {
            count: winners.pending_winner_posts,
            label: "Winner posts to moderate",
            href: "/admin/winners",
            icon: "trophy",
          },
          {
            count: reports.open_reports,
            label: "Open reports",
            href: "/admin/reports",
            icon: "flag",
          },
        ];
        const attention = queues.filter((item) => item.count > 0);

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
              Needs attention
            </h2>
            {attention.length === 0 ? (
              <div className="flex items-center gap-3 rounded-card border border-pine/30 bg-pine/5 p-4">
                <Icon name="check" size={18} className="text-pine" />
                <p className="text-sm font-medium text-pine">
                  Queue clear — all caught up.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-ember/25 bg-surface shadow-e1">
                {attention.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-paper"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ember/10 text-ember">
                        <Icon name={item.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="nums rounded-pill bg-ember px-2.5 py-0.5 text-xs font-bold text-white">
                        {item.count}
                      </span>
                      <Icon
                        name="caretRight"
                        size={14}
                        className="text-graphite"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
            Platform
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard value={platform.total_listings} label="Total listings" />
            <StatCard value={platform.active_listings} label="Active &amp; public" />
            <StatCard
              value={platform.pending_review_listings}
              label="Pending review"
              tone={platform.pending_review_listings > 0 ? "ember" : undefined}
            />
            <StatCard
              value={platform.held_listings}
              label="Held (under review)"
              tone={platform.held_listings > 0 ? "flame" : undefined}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
            Hosts
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard value={hosts.total_hosts} label="Total hosts" />
            <StatCard value={hosts.verified_hosts} label="Admin verified" />
            <StatCard
              value={hosts.pending_verification}
              label="Pending verification"
              tone={hosts.pending_verification > 0 ? "ember" : undefined}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
            Winners &amp; reports
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              value={winners.pending_winner_posts}
              label="Pending winner posts"
              tone={winners.pending_winner_posts > 0 ? "ember" : undefined}
            />
            <StatCard
              value={winners.published_winner_posts}
              label="Published winners"
            />
            <StatCard
              value={reports.open_reports}
              label="Open reports"
              tone={reports.open_reports > 0 ? "ember" : undefined}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
            Recent listings
          </h2>
          <div className="rounded-card border border-line bg-surface p-2 shadow-e1">
            {recent.length === 0 ? (
              <p className="p-3 text-sm text-graphite">No listings yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((listing) => (
                  <li
                    key={listing.id}
                    className="flex items-center justify-between gap-3 px-3 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {listing.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="rounded-pill border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-graphite">
                        {listing.lifecycle_status}
                      </span>
                      <span className="text-xs text-graphite">
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
