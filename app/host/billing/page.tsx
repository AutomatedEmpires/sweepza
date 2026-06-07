import Link from "next/link";
import { getHostBillingSnapshot } from "@/lib/db/host-dashboard";
import { createStripePortalSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HostBillingPage() {
  const billing = await getHostBillingSnapshot();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
        <Link href="/host" className="text-sm text-indigo-600 hover:underline">Back to dashboard</Link>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Subscription status</span>
          <span className="text-sm font-medium text-gray-900">{billing.statusLabel}</span>
        </div>
        <p className="mt-3 text-sm text-gray-700">
          {billing.activeListingCount} of {billing.includedActiveListings} active listing slots used
        </p>
        {billing.isFull ? (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            You&apos;ve used all of your slots. Add capacity for ${billing.addSlotPriceMonthly}/mo per listing.
          </p>
        ) : null}
      </div>

      <form action={createStripePortalSessionAction} className="mt-4">
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Manage billing
        </button>
      </form>
    </div>
  );
}
