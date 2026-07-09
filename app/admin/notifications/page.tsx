import Link from "next/link";
import { getNotificationLog } from "@/lib/db/admin";
import { NOTIFICATION_STATUSES, type NotificationStatus } from "@/lib/db/enums";

export const metadata = {
  title: "Admin Notifications",
  description: "Read-only notification delivery log for debugging.",
};

export const dynamic = "force-dynamic";

const STATUS_CLASSES: Record<NotificationStatus, string> = {
  queued: "bg-ocean/10 text-ocean",
  sent: "bg-ocean/10 text-ocean",
  delivered: "bg-pine/10 text-pine",
  read: "bg-pine/10 text-pine",
  suppressed: "border border-line text-graphite",
  failed: "bg-flame/10 text-flame",
  skipped: "border border-line text-graphite",
};

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
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Notifications log
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
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
              className={`rounded-pill px-3 py-1.5 text-xs font-semibold capitalize transition ${
                isActive
                  ? "bg-ink text-paper"
                  : "border border-line text-ink/70 hover:bg-paper"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 overflow-x-auto rounded-card border border-line bg-surface shadow-e1">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-graphite">
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
                <td className="px-4 py-6 text-sm text-graphite" colSpan={5}>
                  No notifications match this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line">
                  <td className="px-4 py-3 text-graphite">
                    {row.recipient_display_name ?? row.recipient_email ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-graphite">
                    {row.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 capitalize text-graphite">
                    {row.channel.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-pill px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[row.status]}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-graphite">
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
