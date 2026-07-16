import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { HostPitch } from "@/components/host-pitch";
import { HostListingSubmissionForm } from "@/components/host-listing-submission-form";
import { HostProfileForm } from "@/components/host-profile-form";
import type { HostProfileFormValues } from "@/components/host-profile-form";
import {
  getMaxAdditionalListings,
  HOST_BASELINE_PLAN,
  isBillingConfigured,
  MAX_ACTIVE_LISTINGS,
} from "@/lib/billing/plans";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getActiveCategories, getActiveTags } from "@/lib/db/dictionaries";
import { getHostDashboardSnapshotForAppUser } from "@/lib/db/host-dashboard";
import { ensureSubscriptionForHost, getHostByAppUserId } from "@/lib/db/hosts";
import { SITE_URL } from "@/lib/site";
import { createHostCheckoutSession } from "@/lib/stripe/checkout";
import { ensureStripeCustomerForHost } from "@/lib/stripe/server";

const HOST_DESCRIPTION =
  "List your free-to-enter sweepstakes on Sweepza — reviewed listings, official-page entries, and an audience that returns daily to re-enter.";

export const metadata = {
  title: "Host Your Sweepstakes",
  description: HOST_DESCRIPTION,
  alternates: { canonical: new URL("/host", SITE_URL) },
  openGraph: {
    title: "Host Your Sweepstakes",
    description: HOST_DESCRIPTION,
    url: new URL("/host", SITE_URL),
    type: "website",
  },
};
export const dynamic = "force-dynamic";

const QUICK_LINKS: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/host/listings", icon: "sweeps", label: "Listings" },
  { href: "/host/analytics", icon: "chart", label: "Analytics" },
  { href: "/host/notifications", icon: "bell", label: "Notifications" },
  { href: "/host/settings", icon: "settings", label: "Settings" },
];

function formatVerificationStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatSubscriptionStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatListingDate(date: string | null): string {
  if (!date) return "No end date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

function lifecycleStatusStyles(status: string): string {
  if (status === "active") return "bg-pine/10 text-pine";
  if (status === "pending_review") return "bg-ocean/10 text-ocean";
  if (["rejected", "held"].includes(status)) return "bg-flame/10 text-flame";
  return "bg-ink/5 text-graphite";
}

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const checkoutStatus = (await searchParams)?.checkout ?? null;
  const isHost = authUser?.appUser.is_host ?? false;
  const dashboard = authUser
    ? await getHostDashboardSnapshotForAppUser(authUser.appUserId)
    : null;
  const host = dashboard?.host ?? null;
  const subscription = dashboard?.subscription ?? null;
  const listingCounts = dashboard?.counts;
  const recentListings = dashboard?.recentListings ?? [];
  const listingAllowance = subscription
    ? subscription.included_active_listings +
      subscription.purchased_additional_listings
    : 1;
  const activeListings = listingCounts?.active ?? 0;
  const listingSlotsRemaining = Math.max(listingAllowance - activeListings, 0);
  const planActive = subscription?.status === "active";
  const billingConfigured = isBillingConfigured();
  const baselineIncluded = HOST_BASELINE_PLAN.includedActiveListings;
  const maxAdditional = getMaxAdditionalListings();
  const [categories, tags] =
    authUser && isHost && host
      ? await Promise.all([getActiveCategories(), getActiveTags()])
      : [[], []];

  const onboardingProfile: HostProfileFormValues = {
    display_name: authUser?.displayName ?? "",
    website_url: null,
    short_description: null,
    logo_url: null,
  };

  const hostProfileValues: HostProfileFormValues | null = host
    ? {
        display_name: host.display_name,
        website_url: host.website_url,
        short_description: host.short_description,
        logo_url: host.logo_url,
      }
    : null;

  async function connectBillingAction() {
    "use server";

    const currentUser = await ensureCurrentAppUser();
    if (!currentUser?.appUser.is_host) {
      throw new Error("Host access is required to create a billing profile.");
    }

    const currentHost = await getHostByAppUserId(currentUser.appUserId);
    if (!currentHost) {
      throw new Error("Host profile is missing; billing cannot be initialized.");
    }

    await ensureStripeCustomerForHost(currentHost, currentUser.appUser);
    await ensureSubscriptionForHost(currentHost.id);
    revalidatePath("/host");
  }

  async function startCheckoutAction(formData: FormData) {
    "use server";

    const currentUser = await ensureCurrentAppUser();
    if (!currentUser?.appUser.is_host) {
      throw new Error("Host access is required to start a plan.");
    }

    const currentHost = await getHostByAppUserId(currentUser.appUserId);
    if (!currentHost) {
      throw new Error("Host profile is missing; checkout cannot start.");
    }

    const rawAdditional = formData.get("additional_listings");
    const additionalListings =
      typeof rawAdditional === "string"
        ? Number.parseInt(rawAdditional, 10) || 0
        : 0;

    const session = await createHostCheckoutSession({
      host: currentHost,
      appUser: currentUser.appUser,
      additionalListings,
    });

    redirect(session.url);
  }

  return (
    <section className="px-4 pb-10 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <div className="flex flex-col gap-4">
        {/* The dashboard header belongs to signed-in host tooling; the
            signed-out / unconfigured branches render the HostPitch hero. */}
        {clerkConfigured && authUser ? (
          <header className="px-1">
            <h1 className="font-display text-3xl text-ink">Host</h1>
            <p className="mt-2 text-sm text-graphite">
              Manage your host identity, track listing capacity, and keep an eye
              on what is live in Discover.
            </p>
          </header>
        ) : null}

        {checkoutStatus === "success" ? (
          <div className="rounded-card border border-pine/25 bg-pine/5 p-4 text-sm text-ink/75">
            Thanks! Your plan is activating. Listing entitlements update
            automatically once Stripe confirms the subscription.
          </div>
        ) : checkoutStatus === "cancelled" ? (
          <div className="rounded-card border border-line bg-surface p-4 text-sm text-graphite shadow-e1">
            Checkout was cancelled. No changes were made to your plan.
          </div>
        ) : null}

        {!clerkConfigured ? (
          <>
            <HostPitch signInAvailable={false} />
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <h2 className="text-sm font-semibold text-ink">
                Host auth is not configured yet
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-graphite">
                Clerk keys are still missing in this environment, so host
                identity and role-aware listing actions cannot run here yet.
              </p>
            </div>
          </>
        ) : !authUser ? (
          <HostPitch signInAvailable />
        ) : isHost && !host ? (
          <>
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <h2 className="text-sm font-semibold text-ink">
                Finish setting up your host profile
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-graphite">
                Your account is marked as a host, but Sweepza does not have a
                host profile for you yet. Create one below to unlock listing
                submission and your host dashboard.
              </p>
              <dl className="mt-4 grid gap-2 text-sm text-graphite">
                <div className="flex items-center justify-between gap-3">
                  <dt>Signed in as</dt>
                  <dd className="font-medium text-ink">
                    {authUser.displayName ?? "Unnamed"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Email</dt>
                  <dd className="font-medium text-ink">
                    {authUser.email ?? "Not available"}
                  </dd>
                </div>
              </dl>
            </div>
            <HostProfileForm mode="create" initialProfile={onboardingProfile} />
          </>
        ) : (
          <>
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <h2 className="text-sm font-semibold text-ink">
                {isHost ? "Host account detected" : "Account detected"}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-graphite">
                {isHost
                  ? "Your identity is synced into Sweepza and your host dashboard is live against the canonical Supabase data model."
                  : "Your account is synced into Sweepza, but host role access is not enabled on this profile yet."}
              </p>
              {authUser.appUser.is_admin || authUser.appUser.is_owner ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/admin/import"
                    className="inline-flex rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink/75 transition hover:bg-paper"
                  >
                    Open admin import
                  </Link>
                  <Link
                    href="/admin/review"
                    className="inline-flex rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink/75 transition hover:bg-paper"
                  >
                    Open review queue
                  </Link>
                </div>
              ) : null}
              <dl className="mt-4 grid gap-2 text-sm text-graphite">
                <div className="flex items-center justify-between gap-3">
                  <dt>Display name</dt>
                  <dd className="font-medium text-ink">
                    {authUser.displayName ?? "Unnamed"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Email</dt>
                  <dd className="font-medium text-ink">
                    {authUser.email ?? "Not available"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Host role</dt>
                  <dd className="font-medium text-ink">
                    {isHost ? "Enabled" : "Not enabled"}
                  </dd>
                </div>
              </dl>
            </div>

            {host ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {QUICK_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex flex-col items-center gap-1.5 rounded-card border border-line bg-surface px-3 py-3 text-center shadow-e1 transition hover:bg-paper"
                    >
                      <Icon name={link.icon} size={18} className="text-pine" />
                      <span className="text-xs font-semibold text-ink">
                        {link.label}
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                    <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                      Active listings
                    </p>
                    <p className="nums mt-2 font-display text-3xl text-ink">
                      {activeListings}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      {listingSlotsRemaining} slot
                      {listingSlotsRemaining === 1 ? "" : "s"} remaining
                    </p>
                  </div>
                  <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                    <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                      Plan status
                    </p>
                    <p className="mt-2 font-display text-3xl capitalize text-ink">
                      {subscription
                        ? formatSubscriptionStatus(subscription.status)
                        : "No plan"}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      Allowance: {listingAllowance} active listing
                      {listingAllowance === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                    <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                      Public listings
                    </p>
                    <p className="nums mt-2 font-display text-3xl text-ink">
                      {listingCounts?.public ?? 0}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      {listingCounts?.draft ?? 0} draft
                      {(listingCounts?.draft ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                    <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                      Ending soon
                    </p>
                    <p className="nums mt-2 font-display text-3xl text-ink">
                      {listingCounts?.endingSoon ?? 0}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      Within the next 7 days
                    </p>
                  </div>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Icon name="host" size={15} className="text-pine" />
                        {host.display_name}
                      </h2>
                      <p className="mt-1 text-sm text-graphite">
                        Verification:{" "}
                        {formatVerificationStatus(host.verification_status)}
                      </p>
                    </div>
                    {host.website_url ? (
                      <a
                        href={host.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink/75 transition hover:bg-paper"
                      >
                        Visit site
                      </a>
                    ) : null}
                  </div>
                  {host.short_description ? (
                    <p className="mt-3 text-sm leading-relaxed text-graphite">
                      {host.short_description}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-graphite">
                      No short description has been added for this host yet.
                    </p>
                  )}
                  <dl className="mt-4 grid gap-2 text-sm text-graphite">
                    <div className="flex items-center justify-between gap-3">
                      <dt>Stripe customer</dt>
                      <dd className="font-medium text-ink">
                        {host.stripe_customer_id ? "Connected" : "Not connected"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Founding host slot</dt>
                      <dd className="font-medium text-ink">
                        {subscription?.founding_host_number ?? "Not assigned"}
                      </dd>
                    </div>
                  </dl>
                  {!host.stripe_customer_id ? (
                    <form action={connectBillingAction} className="mt-4">
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
                      >
                        Create billing profile
                      </button>
                    </form>
                  ) : null}
                </div>

                {hostProfileValues ? (
                  <HostProfileForm mode="edit" initialProfile={hostProfileValues} />
                ) : null}

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">
                        Billing &amp; plan
                      </h2>
                      <p className="mt-1 text-sm text-graphite">
                        {planActive
                          ? "Your host plan is active. The capacity below reflects your current entitlement."
                          : "Start the baseline host plan to unlock active listing capacity."}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-pill px-3 py-1 text-xs font-bold capitalize ${
                        planActive
                          ? "bg-pine/10 text-pine"
                          : "bg-ink/5 text-graphite"
                      }`}
                    >
                      {subscription
                        ? formatSubscriptionStatus(subscription.status)
                        : "No plan"}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm text-graphite">
                    <div className="flex items-center justify-between gap-3">
                      <dt>Listing allowance</dt>
                      <dd className="font-medium text-ink">
                        {listingAllowance} active listing
                        {listingAllowance === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Included with plan</dt>
                      <dd className="font-medium text-ink">
                        {subscription?.included_active_listings ??
                          baselineIncluded}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Extra capacity purchased</dt>
                      <dd className="font-medium text-ink">
                        {subscription?.purchased_additional_listings ?? 0}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Remaining active slots</dt>
                      <dd className="font-medium text-ink">
                        {listingSlotsRemaining}
                      </dd>
                    </div>
                  </dl>

                  {!billingConfigured ? (
                    <p className="mt-4 text-sm leading-relaxed text-graphite">
                      Plan checkout is not configured in this environment yet.
                      Set the Stripe price IDs to enable purchases.
                    </p>
                  ) : planActive ? (
                    <p className="mt-4 text-sm leading-relaxed text-graphite">
                      Need to change capacity? Contact Sweepza support for now.
                      Self-serve plan changes are not enabled yet.
                    </p>
                  ) : (
                    <form
                      action={startCheckoutAction}
                      className="mt-4 flex flex-col gap-3"
                    >
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium text-ink">
                          Extra active listings
                        </span>
                        <input
                          type="number"
                          name="additional_listings"
                          min={0}
                          max={maxAdditional}
                          defaultValue={0}
                          className="w-28 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                        />
                        <span className="text-xs text-graphite">
                          Baseline plan includes {baselineIncluded}. Add up to{" "}
                          {maxAdditional} more ({MAX_ACTIVE_LISTINGS} active
                          listings max).
                        </span>
                      </label>
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
                      >
                        {subscription && subscription.status !== "no_plan"
                          ? "Restart host plan"
                          : "Start host plan"}
                      </button>
                    </form>
                  )}
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-ink">
                      Recent listings
                    </h2>
                    <span className="text-xs text-graphite">
                      {listingCounts?.total ?? 0} total
                    </span>
                  </div>

                  {recentListings.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {recentListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="rounded-xl border border-line bg-paper px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">
                                {listing.title}
                              </p>
                              <p className="mt-1 text-xs text-graphite">
                                Ends {formatListingDate(listing.end_date)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                              <span
                                className={`rounded-pill px-2 py-1 ${lifecycleStatusStyles(listing.lifecycle_status)}`}
                              >
                                {listing.lifecycle_status}
                              </span>
                              <span className="rounded-pill bg-ink/5 px-2 py-1 text-graphite">
                                {listing.visibility_status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-line bg-paper px-4 py-8 text-center">
                      <Icon name="gift" size={22} className="text-graphite" />
                      <p className="text-sm leading-relaxed text-graphite">
                        No listings yet — create your first one below.
                      </p>
                      <a
                        href="#submit-listing"
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
                      >
                        Create your first listing
                      </a>
                    </div>
                  )}
                </div>

                <div id="submit-listing">
                  <HostListingSubmissionForm categories={categories} tags={tags} />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
