import Link from "next/link";
import { getNotificationPrefs } from "@/lib/db/host-dashboard";
import { updateNotificationPrefsAction } from "./actions";

export const dynamic = "force-dynamic";

const TOGGLES: Array<{ name: string; label: string; description: string }> = [
  { name: "email_on_listing_approved", label: "Listing approved", description: "Email me when a listing is approved and goes live." },
  { name: "email_on_listing_held", label: "Listing held", description: "Email me when a listing is held or needs changes." },
  { name: "email_on_listing_expiring_soon", label: "Listing expiring soon", description: "Email me before a listing reaches its end date." },
  { name: "email_on_new_reaction", label: "New reaction", description: "Email me when someone reacts to one of my winners." },
];

export default async function HostNotificationsPage() {
  const prefs = await getNotificationPrefs();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">Notification preferences</h1>
        <Link
          href="/host"
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
        >
          Dashboard
        </Link>
      </header>

      <form action={updateNotificationPrefsAction} className="flex flex-col gap-3">
        {TOGGLES.map((toggle) => {
          const checked = prefs[toggle.name as keyof typeof prefs] as boolean;
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
