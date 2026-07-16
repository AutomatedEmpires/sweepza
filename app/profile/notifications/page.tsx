import Link from "next/link";
import { Icon } from "@/components/icon";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getSeekerNotificationPrefs } from "@/lib/db/seeker-notification-prefs";
import { updateSeekerNotificationPrefsAction } from "./actions";

export const metadata = { title: "Reminders" };
export const dynamic = "force-dynamic";

// Seeker reminder preferences — the opt-out surface for the seeker-reminders
// cron. Only meaningful for signed-in seekers (prefs are per app_user); local
// browsers have nothing to persist, so they get a sign-in prompt instead.

const TOGGLES: Array<{ name: string; label: string; description: string }> = [
  {
    name: "ready_again",
    label: "Ready to enter again",
    description: "When a daily or recurring sweep's entry window re-opens for you.",
  },
  {
    name: "ends_today",
    label: "Ending today",
    description: "A last-call nudge for a sweep you saved or entered that closes today.",
  },
  {
    name: "ends_soon",
    label: "Ending soon",
    description: "A heads-up a few days before a sweep you're tracking closes.",
  },
];

function BackLink() {
  return (
    <Link
      href="/profile"
      className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
    >
      Profile
    </Link>
  );
}

export default async function SeekerNotificationsPage() {
  const clerkConfigured = isClerkConfigured();
  const authUser = clerkConfigured ? await ensureCurrentAppUser() : null;

  if (!authUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
        <header className="mb-6 flex items-start justify-between gap-3 px-1">
          <h1 className="font-display text-3xl text-ink">Reminders</h1>
          <BackLink />
        </header>
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-e1">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ember/10 text-ember">
            <Icon name="bell" size={22} />
          </span>
          <p className="font-display text-xl text-ink">Sign in to set reminders</p>
          <p className="max-w-[42ch] text-sm leading-relaxed text-graphite">
            Reminder emails keep your streak alive and your saved sweeps from
            slipping away. Sign in to choose which ones you get.
          </p>
          {clerkConfigured && (
            <Link
              href="/sign-in"
              className="mt-1 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  const prefs = await getSeekerNotificationPrefs(authUser.appUserId);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-2 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">Reminders</h1>
        <BackLink />
      </header>
      <p className="mb-6 px-1 text-sm text-graphite">
        Sweepza only emails you when a sweep you saved or entered actually needs
        you — never marketing. Turn any of these off anytime.
      </p>

      <form action={updateSeekerNotificationPrefsAction} className="flex flex-col gap-4">
        {/* Master switch */}
        <label
          htmlFor="email_enabled"
          className="flex items-start gap-3 rounded-card border border-ember/30 bg-ember/[0.04] p-4 shadow-e1"
        >
          <input
            id="email_enabled"
            name="email_enabled"
            type="checkbox"
            defaultChecked={prefs.email_enabled}
            className="mt-1 h-4 w-4 rounded border-line text-ember focus:ring-ember"
          />
          <span>
            <span className="block text-sm font-semibold text-ink">Reminder emails</span>
            <span className="block text-sm text-graphite">
              The master switch. Turn this off to pause every reminder below.
            </span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
            What to send
          </legend>
          {TOGGLES.map((toggle) => {
            const checked = prefs[toggle.name as keyof typeof prefs];
            return (
              <label
                key={toggle.name}
                htmlFor={toggle.name}
                className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-e1"
              >
                <input
                  id={toggle.name}
                  name={toggle.name}
                  type="checkbox"
                  defaultChecked={checked}
                  className="mt-1 h-4 w-4 rounded border-line text-pine focus:ring-pine"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{toggle.label}</span>
                  <span className="block text-sm text-graphite">{toggle.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <button
          type="submit"
          className="mt-1 self-start rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          Save preferences
        </button>
      </form>
    </div>
  );
}
