import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { GamificationStrip } from "@/components/gamification-strip";
import { ProfileSignOut } from "@/components/profile-sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getSeekerGamification } from "@/lib/db/gamification";

export const metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};
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
      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-graphite">
          {body}
        </span>
      </span>
      <Icon name="caretRight" size={14} className="text-ink/35" />
    </Link>
  );
}

function ProfileSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite"
      >
        {title}
      </h2>
      {children}
    </section>
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-10 pt-8 sm:px-6">
      <header className="px-1">
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          Profile
        </h1>
        <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-graphite">
          Manage your sweep routine, account access, and preferences.
        </p>
      </header>

      {/* Identity */}
      {authUser ? (
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-e1 sm:p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pine text-lg font-bold text-on-trust sm:h-14 sm:w-14">
            {(authUser.displayName ?? authUser.email ?? "S")
              .charAt(0)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine">
              Signed-in account
            </p>
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
        <div className="rounded-card border border-line bg-surface p-4 shadow-e1 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink/5 text-graphite">
              <Icon name="profile" size={26} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                You&apos;re browsing locally
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-graphite">
                Activity you record while signed out stays in this browser.
                {clerkConfigured
                  ? " Signing in saves new activity to your account, but your guest history is not imported automatically."
                  : ""}
              </p>
            </div>
          </div>
          {clerkConfigured && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-center text-sm font-semibold text-on-accent transition hover:bg-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-ink/75 transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
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

      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Your activity */}
          <ProfileSection id="profile-activity" title="Your activity">
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
              <LinkRow
                href="/my-sweeps"
                icon="sweeps"
                title="My Sweeps"
                body="Review your saved, entered, ready-again, and won records"
              />
              <LinkRow
                href="/winners/new"
                icon="trophy"
                title="Share a win"
                body="Submit a real win for review before publication"
              />
              <LinkRow
                href="/profile/notifications"
                icon="bell"
                title="Reminders"
                body="Set email preferences for ready-again and deadline reminders"
              />
            </div>
          </ProfileSection>

          <ProfileSection id="profile-appearance" title="Appearance">
            <div className="flex min-h-[4.75rem] items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-e1">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean/10 text-ocean">
                <Icon name="themeAuto" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  Theme
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-graphite">
                  Cycle through automatic, light, and dark
                </span>
              </span>
              <ThemeToggle className="shrink-0 bg-surface-2" />
            </div>
          </ProfileSection>
        </div>

        <div className="flex flex-col gap-6">
          {/* Hosting */}
          <ProfileSection id="profile-hosting" title="Hosting">
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
              <LinkRow
                href="/host"
                icon="host"
                title={
                  authUser?.appUser.is_host
                    ? "Host dashboard"
                    : "Become a host"
                }
                body={
                  authUser?.appUser.is_host
                    ? "Manage listings, seeker-recorded activity, and plan status"
                    : "Apply for review before managing promotion listings"
                }
              />
            </div>
          </ProfileSection>

          {/* Admin — role-gated */}
          {isAdmin && (
            <ProfileSection id="profile-operations" title="Operations">
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
                <LinkRow
                  href="/admin"
                  icon="shield"
                  title="Admin command center"
                  body="Review queues, hosts, reports, and imports"
                />
              </div>
            </ProfileSection>
          )}

          {/* About & legal */}
          <ProfileSection id="profile-about" title="About">
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
          </ProfileSection>
        </div>
      </div>

      {authUser && clerkConfigured && (
        <div className="w-full sm:max-w-xs">
          <ProfileSignOut />
        </div>
      )}

      {/* Was: "Free for seekers · No purchase necessary" — the second half asserted the
          sponsor's legal representation. Sweepza can only speak to its own fee. */}
      <p className="text-center text-[10px] uppercase tracking-[0.15em] text-graphite">
        Free for seekers — Sweepza never charges you
      </p>
    </div>
  );
}
