import Link from "next/link";
import { Icon } from "@/components/icon";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getSeekerNotificationPrefs } from "@/lib/db/seeker-notification-prefs";
import {
  isEmailOutboxSchemaReady,
  isOutboundEmailConfigured,
  isOutboundEmailEnabled,
} from "@/lib/email/outbound-gate";
import { ReminderPreferencesForm } from "./reminder-preferences-form";

export const metadata = {
  title: "Reminders",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Seeker reminder preferences are explicit consent, not an activation control.
// The global outbound gate remains operator-owned and is surfaced honestly below.

function BackLink() {
  return (
    <Link
      href="/profile"
      className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
    >
      Profile
    </Link>
  );
}

function DeliveryStatus({
  enabled,
  configured,
  schemaReady,
}: {
  enabled: boolean;
  configured: boolean;
  schemaReady: boolean;
}) {
  if (!enabled) {
    return (
      <div
        role="status"
        data-delivery-state="inactive"
        className="flex gap-3 rounded-card border border-ocean/25 bg-ocean/[0.06] p-4"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean/10 text-ocean">
          <Icon name="bell" size={17} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">
            Email delivery is inactive
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-graphite">
            Sweepza is not sending reminder emails while outbound delivery is
            inactive. Saving choices here does not activate it.
          </p>
        </div>
      </div>
    );
  }

  if (!configured || !schemaReady) {
    return (
      <div
        role="status"
        data-delivery-state="unavailable"
        className="flex gap-3 rounded-card border border-flame/25 bg-flame/[0.06] p-4"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-flame/10 text-flame">
          <Icon name="bell" size={17} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">
            Email delivery is not ready
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-graphite">
            Sweepza is not sending reminder emails while the delivery service
            is unavailable. Saved choices remain preferences only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-delivery-state="available"
      className="flex gap-3 rounded-card border border-pine/25 bg-pine/[0.06] p-4"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
        <Icon name="bell" size={17} />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">
          Email delivery is available
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-graphite">
          Sweepza may send a reminder only when you allow email, a selected
          category matches current tracked activity, and delivery succeeds.
        </p>
      </div>
    </div>
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
            Sign in to choose whether Sweepza may send ready-again and deadline
            reminders when outbound delivery is available.
          </p>
          {clerkConfigured && (
            <Link
              href="/sign-in"
              className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  const prefs = await getSeekerNotificationPrefs(authUser.appUserId);
  const outboundEnabled = isOutboundEmailEnabled();
  const outboundConfigured = isOutboundEmailConfigured();
  const outboxSchemaReady = isEmailOutboxSchemaReady();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8 sm:px-6">
      <header className="mb-2 flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-pine">
            Preferences
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
            Reminders
          </h1>
        </div>
        <BackLink />
      </header>
      <p className="mb-5 px-1 text-sm leading-relaxed text-graphite">
        Choose whether Sweepza may send ready-again and deadline reminders when
        delivery is available. These settings do not enter promotions or change
        official deadlines.
      </p>

      <div className="mb-5">
        <DeliveryStatus
          enabled={outboundEnabled}
          configured={outboundConfigured}
          schemaReady={outboxSchemaReady}
        />
      </div>

      <ReminderPreferencesForm prefs={prefs} />
    </div>
  );
}
