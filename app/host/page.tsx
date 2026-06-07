export const metadata = { title: "Host" };

import Link from "next/link";

export default function HostPage() {
  return (
    <section className="px-5 pt-10">
      <h1 className="text-2xl font-bold text-ink">Host</h1>
      <p className="mt-2 text-sm text-ink/60">Manage listings, analytics, billing, and preferences.</p>

      <nav className="mt-6 grid gap-3">
        <Link className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink" href="/host/listings">
          Listings
        </Link>
        <Link className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink" href="/host/analytics">
          Analytics
        </Link>
        <Link className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink" href="/host/notifications">
          Notifications
        </Link>
        <Link className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink" href="/host/billing">
          Billing
        </Link>
        <Link className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium text-ink" href="/host/settings">
          Profile
        </Link>
      </nav>
    </section>
  );
}
