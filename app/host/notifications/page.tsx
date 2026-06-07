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
        <h1 className="text-2xl font-semibold text-gray-900">Notification Preferences</h1>
        <Link href="/host" className="text-sm text-indigo-600 hover:underline">Back to dashboard</Link>
      </div>

      <form action={updateNotificationPrefsAction} className="space-y-4">
        {TOGGLES.map((toggle) => {
          const checked = prefs[toggle.name as keyof typeof prefs] as boolean;
          return (
            <label key={toggle.name} htmlFor={toggle.name} className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
              <input
                id={toggle.name}
                name={toggle.name}
                type="checkbox"
                defaultChecked={checked}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{toggle.label}</span>
                <span className="block text-sm text-gray-500">{toggle.description}</span>
              </span>
            </label>
          );
        })}
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Save preferences
        </button>
      </form>
    </div>
  );
}
