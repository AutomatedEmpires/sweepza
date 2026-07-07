import Link from "next/link";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/cn";
import { getHostBillingSnapshot } from "@/lib/db/host-dashboard";
import { createStripePortalSessionAction } from "./actions";

export const metadata = { title: "Host billing" };
export const dynamic = "force-dynamic";

export default async function HostBillingPage() {
  const billing = await getHostBillingSnapshot();
  const used = billing.activeListingCount;
  const total = Math.max(billing.includedActiveListings, 1);
  const usedPct = Math.min(100, Math.round((used / total) * 100));

  return (
    <div className="px-4 pb-8 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <header className="mb-5 flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-3xl text-ink">Billing</h1>
          <p className="mt-1 text-sm text-ink/60">
            Your plan funds Sweepza — seekers always enter free.
          </p>
        </div>
        <Link
          href="/host"
          className="shrink-0 rounded-full border border-sand px-3.5 py-2 text-xs font-semibold text-ink/70 transition hover:bg-ink/5"
        >
          Dashboard
        </Link>
      </header>

      {/* Plan status */}
      <div className="overflow-hidden rounded-card border border-sand bg-cream">
        <div className="flex items-center justify-between border-b border-sand px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="host" size={16} className="text-moss" /> Host plan
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-bold",
              billing.statusLabel === "Active" || billing.statusLabel === "Trialing"
                ? "bg-moss/10 text-moss"
                : billing.statusLabel === "Past Due"
                  ? "bg-ember/10 text-ember"
                  : "bg-ink/5 text-ink/60",
            )}
          >
            {billing.statusLabel}
          </span>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-end justify-between">
            <p className="text-sm text-ink/60">Active listing slots</p>
            <p className="font-display text-2xl leading-none text-ink">
              {used}
              <span className="text-base text-ink/55"> / {total}</span>
            </p>
          </div>
          <div
            role="meter"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Active listing slots used"
            className="mt-2 h-2 overflow-hidden rounded-full bg-sand"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                billing.isFull ? "bg-ember" : "bg-moss",
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {billing.isFull ? (
            <p className="mt-3 rounded-card border border-ember/25 bg-ember/5 p-3 text-sm leading-relaxed text-ink/75">
              All slots are in use. Add capacity for ${billing.addSlotPriceMonthly}/mo
              per extra listing, or pause a campaign to free a slot.
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink/50">
              Each slot keeps one campaign live in Discover, Today, and Search.
            </p>
          )}
        </div>
      </div>

      {/* Portal */}
      <form action={createStripePortalSessionAction} className="mt-4">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-moss px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-moss/90"
        >
          Manage billing in Stripe <Icon name="caretRight" size={15} />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-ink/60">
        Payment methods, invoices, plan changes, and cancellation are handled in
        the secure Stripe portal.
      </p>
    </div>
  );
}
