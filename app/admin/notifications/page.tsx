import Link from "next/link";
import { getNotificationLog } from "@/lib/db/admin";
import { NOTIFICATION_STATUSES, type NotificationStatus } from "@/lib/db/enums";

export const metadata = {
  title: "Admin Notifications",
  description: "Read-only notification delivery log for debugging.",
};

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): NotificationStatus | undefined {
  return (NOTIFICATION_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as NotificationStatus)
    : undefined;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = parseStatus(status);
  const rows = await getNotificationLog(activeStatus);

  const filters: { id: string; label: string; href: string }[] = [
    { id: "all", label: "All", href: "/admin/notifications" },
    ...NOTIFICATION_STATUSES.map((value) => ({
      id: value,
      label: value,
      href: `/admin/notifications?status=${value}`,
    })),
  ];

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Notifications log</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          The last 100 notification deliveries across all channels. Read-only.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((tab) => {
          const isActive =
            tab.id === "all" ? !activeStatus : tab.id === activeStatus;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
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
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-sand text-xs uppercase tracking-wide text-ink/55">
              <th className="px-4 py-3 font-semibold">Recipient</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Channel</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-ink/60" colSpan={5}>
                  No notifications match this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-sand/70">
                  <td className="px-4 py-3 text-ink/80">
                    {row.recipient_display_name ?? row.recipient_email ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-ink/80">
                    {row.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 capitalize text-ink/70">
                    {row.channel.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 capitalize text-ink/70">
                    {row.status}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {formatDateTime(row.created_at)}
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
