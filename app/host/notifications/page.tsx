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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Notification Preferences</h1>
        <Link href="/host" className="text-sm text-moss hover:underline">Back to dashboard</Link>
      </div>

      <form action={updateNotificationPrefsAction} className="space-y-4">
        {TOGGLES.map((toggle) => {
          const checked = prefs[toggle.name as keyof typeof prefs] as boolean;
          return (
            <label key={toggle.name} htmlFor={toggle.name} className="flex items-start gap-3 rounded-card border border-sand bg-cream p-4">
              <input
                id={toggle.name}
                name={toggle.name}
                type="checkbox"
                defaultChecked={checked}
                className="mt-1 h-4 w-4 rounded border-sand text-moss focus:ring-moss"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{toggle.label}</span>
                <span className="block text-sm text-ink/60">{toggle.description}</span>
              </span>
            </label>
          );
        })}
        <button type="submit" className="rounded-full bg-moss px-4 py-2 text-sm font-medium text-cream hover:bg-moss/90">
          Save preferences
        </button>
      </form>
    </div>
  );
}
