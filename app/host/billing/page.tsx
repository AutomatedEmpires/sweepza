import Link from "next/link";
import { getHostBillingSnapshot } from "@/lib/db/host-dashboard";
import { createStripePortalSessionAction } from "./actions";

export const metadata = { title: "Host Billing" };

export default async function HostBillingPage() {
  const snapshot = await getHostBillingSnapshot();
  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Billing</h1>
          <p className="mt-2 text-sm text-ink/60">Subscription status and slots.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">Back</Link>
      </header>
      <div className="mt-6 grid gap-3">
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold text-ink/60">Status</p>
          <p className="mt-2 text-lg font-bold text-ink">{snapshot.statusLabel}</p>
          <p className="mt-1 text-xs text-ink/60">{snapshot.activeListingCount} of {snapshot.includedActiveListings} active listing slots used</p>
          {snapshot.isFull ? <p className="mt-2 text-xs font-medium text-ink/70">Add another slot — ${snapshot.addSlotPriceMonthly}/mo</p> : null}
        </div>
        <form action={createStripePortalSessionAction}>
          <button className="h-11 w-full rounded-xl border border-ink/15 bg-white text-sm font-semibold text-ink">Manage billing</button>
        </form>
      </div>
    </section>
  );
}
