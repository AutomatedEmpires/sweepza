import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { GamificationStrip } from "@/components/gamification-strip";
import { ProfileSignOut } from "@/components/profile-sign-out";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getSeekerGamification } from "@/lib/db/gamification";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

// Profile — account hub and the role-aware gateway to host and admin tools.
// Host/admin access lives here (not in the consumer bottom nav) per the
// consumer-first IA.

function LinkRow({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink/5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-graphite">{body}</span>
      </span>
      <Icon name="caretRight" size={14} className="text-ink/35" />
    </Link>
  );
}

export default async function ProfilePage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const isAdmin = Boolean(
    authUser?.appUser.is_admin || authUser?.appUser.is_owner,
  );
  const gamification = authUser
    ? await getSeekerGamification(authUser.appUserId)
    : null;

  return (
    <section className="flex flex-col gap-5 px-4 pb-8 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <header className="px-1">
        <h1 className="font-display text-3xl text-ink">Profile</h1>
      </header>

      {/* Identity */}
      {authUser ? (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-e1">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pine text-lg font-bold text-on-trust">
            {(authUser.displayName ?? authUser.email ?? "S")
              .charAt(0)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {authUser.displayName ?? "Sweepza seeker"}
            </p>
            {authUser.email && (
              <p className="truncate text-xs text-graphite">
                {authUser.email}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink/5 text-graphite">
              <Icon name="profile" size={26} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                You&apos;re browsing locally
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-graphite">
                Your sweep activity is saved on this device only.
                {clerkConfigured
                  ? " Sign in to sync it to your Sweepza account."
                  : ""}
              </p>
            </div>
          </div>
          {clerkConfigured && (
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center justify-center flex-1 rounded-xl bg-ember px-4 py-2.5 text-center text-sm font-semibold text-on-accent transition hover:bg-ember/90"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-11 items-center justify-center flex-1 rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Streak & badges */}
      {gamification && gamification.stats.totalEntries > 0 && (
        <GamificationStrip data={gamification} />
      )}

      {/* Your activity */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
          Your activity
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <LinkRow
            href="/my-sweeps"
            icon="sweeps"
            title="My Sweeps"
            body="Saved, entered, ready again, and won"
          />
          <LinkRow
            href="/winners/new"
            icon="trophy"
            title="Share a win"
            body="Post your win to the Winner Wall"
          />
          <LinkRow
            href="/profile/notifications"
            icon="bell"
            title="Reminders"
            body="Choose which reminder emails you get"
          />
        </div>
      </div>

      {/* Hosting */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
          Hosting
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <LinkRow
            href="/host"
            icon="host"
            title={authUser?.appUser.is_host ? "Host dashboard" : "Become a host"}
            body={
              authUser?.appUser.is_host
                ? "Manage listings, analytics, and billing"
                : "List and promote your sweepstakes on Sweepza"
            }
          />
        </div>
      </div>

      {/* Admin — role-gated */}
      {isAdmin && (
        <div>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
            Operations
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
            <LinkRow
              href="/admin"
              icon="shield"
              title="Admin command center"
              body="Review queues, hosts, reports, and imports"
            />
          </div>
        </div>
      )}

      {/* About & legal */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
          About
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <LinkRow
            href="/about"
            icon="info"
            title="About Sweepza"
            body="What we are and how listings get here"
          />
          <LinkRow
            href="/faq"
            icon="info"
            title="FAQ"
            body="Common questions, answered"
          />
          <LinkRow
            href="/privacy"
            icon="rules"
            title="Privacy policy"
            body="How your data is handled"
          />
          <LinkRow
            href="/terms"
            icon="rules"
            title="Terms of service"
            body="The rules of the road"
          />
        </div>
      </div>

      {authUser && clerkConfigured && <ProfileSignOut />}

      <p className="text-center text-[10px] uppercase tracking-[0.15em] text-graphite">
        Free for seekers · No purchase necessary
      </p>
    </section>
  );
}
