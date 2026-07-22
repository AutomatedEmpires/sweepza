import Link from "next/link";

import { HostListingClaimForm } from "@/components/host-listing-claim-form";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getHostByAppUserId } from "@/lib/db/hosts";
import { listHostListingClaims } from "@/lib/db/listing-claims";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listing claims" };

function ClaimsShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-8">
      <header>
        <Link href="/host" className="text-sm font-semibold text-ember">
          Back to host dashboard
        </Link>
        <h1 className="mt-3 font-display text-3xl text-ink">Listing claims</h1>
        <p className="mt-2 text-sm text-graphite">
          Request management authority for an official-source listing already on Sweepza.
        </p>
      </header>
      {children}
    </section>
  );
}

function AccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 text-sm leading-relaxed text-graphite shadow-e1">
      {children}
    </div>
  );
}

export default async function HostClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const listingId = (await searchParams).listingId ?? "";
  if (!isClerkConfigured()) {
    return (
      <ClaimsShell>
        <AccessNotice>Host identity is unavailable in this environment.</AccessNotice>
      </ClaimsShell>
    );
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    const redirectUrl = "/host/claims?listingId=" + encodeURIComponent(listingId);
    return (
      <ClaimsShell>
        <AccessNotice>
          Sign in before requesting authority.{" "}
          <Link
            href={"/sign-in?redirect_url=" + encodeURIComponent(redirectUrl)}
            className="font-semibold text-ember"
          >
            Sign in
          </Link>
        </AccessNotice>
      </ClaimsShell>
    );
  }

  if (!authUser.appUser.is_host) {
    return (
      <ClaimsShell>
        <AccessNotice>
          Submit your host authority application before claiming a listing.{" "}
          <Link href="/host" className="font-semibold text-ember">
            Apply for host access
          </Link>
        </AccessNotice>
      </ClaimsShell>
    );
  }

  const host = await getHostByAppUserId(authUser.appUserId);
  if (!host) {
    return (
      <ClaimsShell>
        <AccessNotice>Your host profile is missing. Return to the host dashboard to complete setup.</AccessNotice>
      </ClaimsShell>
    );
  }
  if (host.account_status === "suspended") {
    return (
      <ClaimsShell>
        <AccessNotice>
          This host account is suspended and cannot submit listing claims. Billing access remains available from the{" "}
          <Link href="/host/billing" className="font-semibold text-ember">billing page</Link>.
        </AccessNotice>
      </ClaimsShell>
    );
  }

  const claims = await listHostListingClaims(host.id);
  return (
    <ClaimsShell>
      {host.verification_status === "admin_verified" ? (
        <HostListingClaimForm defaultListingId={listingId} />
      ) : (
        <AccessNotice>Your host identity must be administrator-verified before you can claim a listing.</AccessNotice>
      )}
      <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
        <h2 className="font-display text-xl font-bold text-ink">Your claim history</h2>
        {claims.length === 0 ? (
          <p className="mt-3 text-sm text-graphite">No claims submitted.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-line bg-paper p-3">
                <p className="font-semibold text-ink">{claim.listing?.title ?? claim.listing_id}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-graphite">{claim.status}</p>
                {claim.review_notes ? (
                  <p className="mt-2 text-sm text-graphite">Reviewer notes: {claim.review_notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClaimsShell>
  );
}
