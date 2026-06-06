import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { HostListingSubmissionForm } from "@/components/host-listing-submission-form";
import { getActiveCategories, getActiveTags } from "@/lib/db/dictionaries";
import { getHostDashboardSnapshotForAppUser } from "@/lib/db/host-dashboard";
import { ensureSubscriptionForHost, getHostByAppUserId } from "@/lib/db/hosts";
import { ensureStripeCustomerForHost } from "@/lib/stripe/server";

export const metadata = { title: "Host" };
export const dynamic = "force-dynamic";

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

export default async function HostPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const isHost = authUser?.appUser.is_host ?? false;
  const dashboard = authUser
    ? await getHostDashboardSnapshotForAppUser(authUser.appUserId)
    : null;
  const host = dashboard?.host ?? null;
  const subscription = dashboard?.subscription ?? null;
  const listingCounts = dashboard?.counts;
  const recentListings = dashboard?.recentListings ?? [];
  const listingAllowance = subscription
    ? subscription.included_active_listings + subscription.purchased_additional_listings
    : 1;
  const activeListings = listingCounts?.active ?? 0;
  const listingSlotsRemaining = Math.max(listingAllowance - activeListings, 0);
  const [categories, tags] = authUser && isHost && host
    ? await Promise.all([getActiveCategories(), getActiveTags()])
    : [[], []];

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

  return (
    <section className="px-5 pb-10 pt-8">
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold text-ink">Host</h1>
          <p className="mt-2 text-sm text-ink/60">
            Manage your host identity, track listing capacity, and keep an eye
            on what is live in Discover.
          </p>
        </header>

        {!clerkConfigured ? (
          <div className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-sm font-semibold text-ink">
              Host auth is not configured yet
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              Clerk keys are still missing in this environment, so host identity
              and role-aware listing actions cannot run here yet.
            </p>
          </div>
        ) : !authUser ? (
          <div className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-sm font-semibold text-ink">
              Sign in to access host tools
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              Host workflows depend on your Sweepza account and role mappings in
              Supabase.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/sign-in"
                className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : isHost && !host ? (
          <div className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-sm font-semibold text-ink">
              Host role is enabled, but the host profile is missing
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              Your app user is marked as a host, but Sweepza does not have a
              matching host row yet. That usually means identity sync landed
              before host onboarding.
            </p>
            <dl className="mt-4 grid gap-2 text-sm text-ink/70">
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
            </dl>
          </div>
        ) : (
          <>
            <div className="rounded-card border border-sand bg-white/70 p-4">
              <h2 className="text-sm font-semibold text-ink">
                {isHost ? "Host account detected" : "Account detected"}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink/65">
                {isHost
                  ? "Your identity is synced into Sweepza and your host dashboard is live against the canonical Supabase data model."
                  : "Your account is synced into Sweepza, but host role access is not enabled on this profile yet."}
              </p>
              {authUser.appUser.is_admin || authUser.appUser.is_owner ? (
                <div className="mt-3">
                  <Link
                    href="/admin/import"
                    className="inline-flex rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
                  >
                    Open admin import
                  </Link>
                </div>
              ) : null}
              <dl className="mt-4 grid gap-2 text-sm text-ink/70">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-card border border-sand bg-cream p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">
                      Active listings
                    </p>
                    <p className="mt-2 text-3xl font-display text-ink">
                      {activeListings}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {listingSlotsRemaining} slot
                      {listingSlotsRemaining === 1 ? "" : "s"} remaining
                    </p>
                  </div>
                  <div className="rounded-card border border-sand bg-cream p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">
                      Plan status
                    </p>
                    <p className="mt-2 text-3xl font-display text-ink">
                      {subscription ? formatSubscriptionStatus(subscription.status) : "No plan"}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      Allowance: {listingAllowance} active listing
                      {listingAllowance === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-card border border-sand bg-cream p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">
                      Public listings
                    </p>
                    <p className="mt-2 text-3xl font-display text-ink">
                      {listingCounts?.public ?? 0}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {listingCounts?.draft ?? 0} draft
                      {(listingCounts?.draft ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-card border border-sand bg-cream p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">
                      Ending soon
                    </p>
                    <p className="mt-2 text-3xl font-display text-ink">
                      {listingCounts?.endingSoon ?? 0}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      Within the next 7 days
                    </p>
                  </div>
                </div>

                <div className="rounded-card border border-sand bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">
                        {host.display_name}
                      </h2>
                      <p className="mt-1 text-sm text-ink/65">
                        Verification: {formatVerificationStatus(host.verification_status)}
                      </p>
                    </div>
                    {host.website_url ? (
                      <a
                        href={host.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-sand px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-ink/5"
                      >
                        Visit site
                      </a>
                    ) : null}
                  </div>
                  {host.short_description ? (
                    <p className="mt-3 text-sm leading-relaxed text-ink/65">
                      {host.short_description}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-ink/55">
                      No short description has been added for this host yet.
                    </p>
                  )}
                  <dl className="mt-4 grid gap-2 text-sm text-ink/70">
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
                        className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
                      >
                        Create billing profile
                      </button>
                    </form>
                  ) : null}
                </div>

                <div className="rounded-card border border-sand bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-ink">
                      Recent listings
                    </h2>
                    <span className="text-xs text-ink/45">
                      {listingCounts?.total ?? 0} total
                    </span>
                  </div>

                  {recentListings.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {recentListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="rounded-2xl border border-sand bg-cream px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">
                                {listing.title}
                              </p>
                              <p className="mt-1 text-xs text-ink/55">
                                Ends {formatListingDate(listing.end_date)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                              <span className="rounded-full bg-moss/10 px-2 py-1 text-moss">
                                {listing.lifecycle_status}
                              </span>
                              <span className="rounded-full bg-ink/5 px-2 py-1 text-ink/60">
                                {listing.visibility_status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-ink/60">
                      No listings are connected to this host yet. The next app
                      slice is the host listing builder and submission flow.
                    </p>
                  )}
                </div>

                <HostListingSubmissionForm categories={categories} tags={tags} />
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
