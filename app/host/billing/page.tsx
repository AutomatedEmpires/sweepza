import Link from "next/link";
import { Icon } from "@/components/icon";
import { isPaymentsEnabled } from "@/lib/billing/payment-gate";
import { cn } from "@/lib/cn";
import { getHostBillingSnapshot } from "@/lib/db/host-dashboard";
import { createStripePortalSessionAction } from "./actions";

export const metadata = { title: "Host billing" };
export const dynamic = "force-dynamic";

export default async function HostBillingPage() {
  const paymentsEnabled = isPaymentsEnabled();
  const billing = await getHostBillingSnapshot();
  const used = billing.activeListingCount;
  const total = Math.max(billing.includedActiveListings, 1);
  const usedPct = Math.min(100, Math.round((used / total) * 100));

  return (
    <div className="px-4 pb-8 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <header className="mb-5 flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-3xl text-ink">Billing</h1>
          <p className="mt-1 text-sm text-graphite">
            {paymentsEnabled
              ? "Your plan funds Sweepza — seekers always enter free."
              : "Paid plans are not enabled; existing records are shown read-only."}
          </p>
        </div>
        <Link
          href="/host"
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-ink/5"
        >
          Dashboard
        </Link>
      </header>

      {/* Plan status */}
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="host" size={16} className="text-pine" /> Host plan
          </span>
          <span
            className={cn(
              "rounded-pill px-2.5 py-1 text-xs font-bold",
              billing.statusLabel === "Active" || billing.statusLabel === "Trialing"
                ? "bg-pine/10 text-pine"
                : billing.statusLabel === "Past Due"
                  ? "bg-ember/10 text-ember"
                  : "bg-ink/5 text-graphite",
            )}
          >
            {billing.statusLabel}
          </span>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-end justify-between">
            <p className="text-sm text-graphite">Active listing slots</p>
            <p className="font-display text-2xl leading-none text-ink">
              {used}
              <span className="text-base text-graphite"> / {total}</span>
            </p>
          </div>
          <div
            role="meter"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Active listing slots used"
            className="mt-2 h-2 overflow-hidden rounded-pill bg-line"
          >
            <div
              className={cn(
                "h-full rounded-pill transition-all",
                billing.isFull ? "bg-ember" : "bg-pine",
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {paymentsEnabled && billing.isFull ? (
            <p className="mt-3 rounded-card border border-ember/25 bg-ember/5 p-3 text-sm leading-relaxed text-ink/75">
              All slots are in use. Add capacity for ${billing.addSlotPriceMonthly}/mo
              per extra listing, or pause a campaign to free a slot.
            </p>
          ) : paymentsEnabled ? (
            <p className="mt-3 text-xs text-graphite">
              Each slot keeps one campaign live in Discover, Today, and Search.
            </p>
          ) : (
            <p className="mt-3 text-xs text-graphite">
              The current free allowance is enforced without opening checkout
              or a billing portal.
            </p>
          )}
        </div>
      </div>

      {/* Portal */}
      {paymentsEnabled ? (
        <>
          <form action={createStripePortalSessionAction} className="mt-4">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
            >
              Manage billing in Stripe <Icon name="caretRight" size={15} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-graphite">
            Payment methods, invoices, plan changes, and cancellation are
            handled in the secure Stripe portal.
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-card border border-line bg-surface p-4 text-sm leading-relaxed text-graphite shadow-e1">
          Payments are not enabled. Plan history remains visible, but Sweepza
          will not open a billing portal or initiate a payment operation.
        </p>
      )}
    </div>
  );
}
