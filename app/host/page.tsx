import Link from "next/link";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";

export const metadata = { title: "Host" };
export const dynamic = "force-dynamic";

export default async function HostPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const isHost = authUser?.appUser.is_host ?? false;

  return (
    <section className="px-5 pb-10 pt-8">
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold text-ink">Host</h1>
          <p className="mt-2 text-sm text-ink/60">
            Sweepza host tooling is being wired in around the same canonical
            listing model as Discover and Saved.
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
        ) : (
          <div className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-sm font-semibold text-ink">
              {isHost ? "Host account detected" : "Account detected"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              {isHost
                ? "Your identity is synced into Sweepza. The next host slice is the listing builder, submission flow, and entitlement-aware host dashboard."
                : "Your account is synced into Sweepza, but host role access is not enabled on this profile yet."}
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
              <div className="flex items-center justify-between gap-3">
                <dt>Host role</dt>
                <dd className="font-medium text-ink">
                  {isHost ? "Enabled" : "Not enabled"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
