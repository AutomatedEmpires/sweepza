import Link from "next/link";
import { AdminHostActions } from "@/components/admin-host-actions";
import { getAdminHosts, type HostFilter } from "@/lib/db/admin";

export const metadata = {
  title: "Admin Hosts",
  description: "Review, verify, and suspend Sweepza hosts.",
};

export const dynamic = "force-dynamic";

const FILTERS: { id: HostFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending Verification" },
  { id: "verified", label: "Verified" },
  { id: "unverified", label: "Unverified" },
];

const VERIFICATION_LABELS: Record<string, string> = {
  none: "Unverified",
  self_verified: "Self-verified",
  admin_verified: "Admin verified",
};

function parseFilter(value: string | undefined): HostFilter {
  if (value === "pending" || value === "verified" || value === "unverified") {
    return value;
  }
  return "all";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminHostsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const active = parseFilter(filter);
  const hosts = await getAdminHosts(active);

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Hosts</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          Verify hosts into the trusted tier or suspend them and unlist their
          listings.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((tab) => {
          const isActive = tab.id === active;
          const href =
            tab.id === "all" ? "/admin/hosts" : `/admin/hosts?filter=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-cream"
                  : "border border-sand text-ink/70 hover:bg-ink/5"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 overflow-x-auto rounded-card border border-sand bg-white/80">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-sand text-xs uppercase tracking-wide text-ink/55">
              <th className="px-4 py-3 font-semibold">Host name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Verified status</th>
              <th className="px-4 py-3 font-semibold">Subscription</th>
              <th className="px-4 py-3 font-semibold">Active listings</th>
              <th className="px-4 py-3 font-semibold">Joined date</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {hosts.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-ink/60" colSpan={7}>
                  No hosts match this filter.
                </td>
              </tr>
            ) : (
              hosts.map((host) => (
                <tr key={host.id} className="border-b border-sand/70 align-top">
                  <td className="px-4 py-3 font-medium text-ink">
                    {host.display_name}
                    {host.user_display_name ? (
                      <span className="block text-xs font-normal text-ink/55">
                        {host.user_display_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{host.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink/65">
                      {VERIFICATION_LABELS[host.verification_status] ??
                        host.verification_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {host.subscription_status
                      ? `${host.subscription_status}${
                          host.max_active_listings !== null
                            ? ` · ${host.max_active_listings} active`
                            : ""
                        }`
                      : "No plan"}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{host.active_listings}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {formatDate(host.joined_at)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminHostActions hostId={host.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
